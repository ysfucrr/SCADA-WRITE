/**
 * SCADA Cloud Bridge Agent Service - Socket.IO Version
 * 
 * Connects to Cloud Bridge Server via Socket.IO and forwards requests to local SCADA API.
 * 
 * Socket.IO provides better reliability and performance compared to raw WebSockets.
 */

const io = require('socket.io-client');
const { MongoClient } = require('mongodb');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

// Socket.io client for SCADA local API (yeni)
let localSocket = null;

// İzlenen register'ları takip et
const watchedRegisters = new Map(); // key: "analyzerId-address"

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scada';
const LOCAL_API_URL = 'http://localhost:3000'; // Next.js API portu
const RECONNECT_INTERVAL = 5000; // Yeniden bağlanma aralığı (ms)
const DEFAULT_BRIDGE_URL = 'http://localhost:4000'; // Default fallback if no settings found

let BRIDGE_URL = DEFAULT_BRIDGE_URL;
let socket = null;
let reconnectTimer = null;
let isConnecting = false;

// Helper function to log messages with timestamps
function log(message, ...args) {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
}

// Helper function to log errors with timestamps
function logError(message, error) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
}

// Function to handle API requests from the bridge
async function handleApiRequest(requestData, callback) {
  const { requestId, method, path, body } = requestData;
  
  log(`Received API request: ${method} ${path} (ID: ${requestId})`);
  
  try {
    // Build the URL for the local API
    const url = `${LOCAL_API_URL}${path}`;
    
    // Prepare fetch options
    const fetchOptions = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    // Add body for methods that support it
    if (method !== 'GET' && method !== 'HEAD' && body) {
      fetchOptions.body = JSON.stringify(body);
    }
    
    log(`Forwarding request to: ${url}`);
    
    // Make the request to the local API
    const response = await fetch(url, fetchOptions);
    
    // İçerik türünü kontrol et
    const contentType = response.headers.get('content-type');
    let responseData;
    
    try {
      if (contentType && contentType.includes('application/json')) {
        // JSON yanıt için
        responseData = await response.json();
      } else {
        // JSON olmayan yanıt için (HTML, text vb.)
        const text = await response.text();
        responseData = {
          content: text,
          contentType: contentType || 'text/plain',
          isNonJsonResponse: true
        };
      }
    } catch (error) {
      // Yanıt ayrıştırma hatası durumunda
      const text = await response.text();
      responseData = {
        content: text,
        parseError: error.message,
        isNonJsonResponse: true
      };
    }
    
    log(`Received response from local API (ID: ${requestId}), status: ${response.status}, content-type: ${contentType || 'unknown'}`);
    
    // Create response object
    const apiResponse = {
      status: response.status,
      data: responseData
    };
    
    // Send response back using acknowledgment callback
    if (typeof callback === 'function') {
      callback(apiResponse);
    } else {
      // Fallback if callback is not a function
      socket.emit('api-response', {
        requestId,
        ...apiResponse
      });
    }
    
  } catch (error) {
    logError(`Error handling API request (ID: ${requestId}):`, error);
    
    // Send error response back to the bridge
    const errorResponse = {
      status: 500,
      data: {
        error: 'Agent Error',
        message: error.message || 'Unknown error occurred'
      }
    };
    
    if (typeof callback === 'function') {
      callback(errorResponse);
    } else {
      socket.emit('api-response', {
        requestId,
        ...errorResponse
      });
    }
  }
}

// Function to load cloud settings from MongoDB
async function loadCloudSettings() {
  let client = null;
  
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db();
    const settings = await db.collection('cloud_settings').findOne({});
    
    if (settings && settings.serverIp) {
      // Use HTTP port for Socket.IO connection
      const newUrl = `http://${settings.serverIp}:${settings.httpPort}`;
      
      if (BRIDGE_URL !== newUrl) {
        log(`Updating Cloud Bridge URL to ${newUrl}`);
        BRIDGE_URL = newUrl;
        
        // If we already have a connection and the URL changed, reconnect
        if (socket && socket.connected) {
          log('URL changed, reconnecting...');
          socket.disconnect();
        }
      }
    } else {
      log('No cloud settings found in database, using default URL');
    }
  } catch (error) {
    logError('Error loading cloud settings from database:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Function to connect to the bridge
async function connectToBridge() {
  // First load the latest settings
  await loadCloudSettings();
  
  // Prevent multiple connection attempts
  if (isConnecting) return;
  isConnecting = true;
  
  // Clear any existing reconnect timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  log(`Connecting to Cloud Bridge at ${BRIDGE_URL}...`);
  
  try {
    // Connect to the Socket.IO server
    socket = io(BRIDGE_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    // Local SCADA WebSocket API'sine bağlanma denemesi
    if (!localSocket) {
      log('Connecting to local SCADA WebSocket API...');
      
      // LOCAL_API_URL'de WebSocket port kullanımı
      // SCADA'nın WebSocket API'si genellikle 3001 portunda çalışır (API portu)
      const localWebSocketUrl = 'http://localhost:3001';
      log(`Using WebSocket URL: ${localWebSocketUrl}`);
      
      localSocket = io(localWebSocketUrl, {
        reconnection: true,
        reconnectionAttempts: 3,  // Sadece 3 kez dene, sürekli tekrar etme
        reconnectionDelay: 2000,
        timeout: 10000,           // Timeout süresini artır
        path: '/socket.io/',
        transports: ['websocket', 'polling']
      });

      // Register değeri güncellemelerini dinle ve cloud-bridge'e ilet
      localSocket.on('register-value', (data) => {
        const registerKey = `${data.analyzerId}-${data.address}`;
        
        // Bu register izleniyorsa bridge'e ilet
        if (watchedRegisters.has(registerKey)) {
          log(`Received register value update from SCADA: ${registerKey}`);
          
          // Socket bağlı ise, register güncellemesini cloud-bridge'e ilet
          if (socket && socket.connected) {
            socket.emit('forward-register-value', data);
            log(`Forwarded register value to cloud bridge: ${registerKey}`);
          }
        }
      });

      localSocket.on('connect', () => {
        log('Connected to local SCADA WebSocket API');
      });

      localSocket.on('disconnect', (reason) => {
        log(`Disconnected from local SCADA WebSocket: ${reason}`);
      });

      localSocket.on('connect_error', (error) => {
        logError('Error connecting to local SCADA WebSocket:', error);
        log('NOTE: Agent will continue to work, but real-time register updates will not be available for mobile app');
        log('Cloud Bridge HTTP API proxying still works normally');
        
        // Hata durumunda 30 saniye sonra tekrar bağlanmayı deneyelim
        setTimeout(() => {
          if (localSocket) {
            log('Attempting to reconnect to local SCADA WebSocket API...');
            localSocket.connect();
          }
        }, 30000);
      });
    }
    
    // Connection event
    socket.on('connect', () => {
      log('Connected to Cloud Bridge successfully!');
      isConnecting = false;
      
      // Send identification data
      socket.emit('identify', {
        version: '1.0.0',
        hostname: require('os').hostname(),
        platform: process.platform
      });
      
      // Set up ping/pong for keeping connection alive
      setInterval(() => {
        socket.emit('ping');
      }, 30000);
    });
    
    // System messages
    socket.on('system', (data) => {
      log(`System message from bridge: ${data.message}`);
    });
    
    // API requests
    socket.on('api-request', handleApiRequest);
    
    // Mobil uygulamadan gelen register izleme istekleri
    socket.on('watch-register-mobile', (registerData) => {
      const registerKey = `${registerData.analyzerId}-${registerData.address}`;
      log(`Received watch-register request from mobile via bridge: ${registerKey}`);
      
      // Bu register'ı izlenenler listesine ekle
      watchedRegisters.set(registerKey, registerData);
      
      // Yerel SCADA WebSocket bağlantısı varsa izleme isteğini ilet
      if (localSocket && localSocket.connected) {
        log(`Forwarding watch-register to local SCADA: ${registerKey}`);
        localSocket.emit('watch-register', registerData);
      } else {
        log(`Cannot forward watch-register - local WebSocket not connected`);
      }
    });
    
    // Mobil uygulamadan gelen register izlemeyi durdurma istekleri
    socket.on('unwatch-register-mobile', (registerData) => {
      const registerKey = `${registerData.analyzerId}-${registerData.address}`;
      log(`Received unwatch-register request from mobile via bridge: ${registerKey}`);
      
      // Bu register'ı izlenenler listesinden çıkar
      watchedRegisters.delete(registerKey);
      
      // Yerel SCADA WebSocket bağlantısı varsa izlemeyi durdurma isteğini ilet
      if (localSocket && localSocket.connected) {
        log(`Forwarding unwatch-register to local SCADA: ${registerKey}`);
        localSocket.emit('unwatch-register', registerData);
      }
    });
    
    // Pong responses
    socket.on('pong', (data) => {
      log(`Received pong from server: ${data.timestamp}`);
    });
    
    // Disconnection event
    socket.on('disconnect', (reason) => {
      log(`Connection to Cloud Bridge closed. Reason: ${reason}`);
      isConnecting = false;
      
      // Socket.IO automatically tries to reconnect,
      // but we'll set up our own fallback just in case
      scheduleReconnect();
    });
    
    // Connection error
    socket.on('connect_error', (error) => {
      logError('Socket.IO connection error:', error);
      isConnecting = false;
      
      // Socket.IO automatically tries to reconnect,
      // but we'll set up our own fallback just in case
      scheduleReconnect();
    });
    
  } catch (error) {
    logError('Failed to connect to Cloud Bridge:', error);
    isConnecting = false;
    scheduleReconnect();
  }
}

// Schedule reconnection
function scheduleReconnect() {
  if (!reconnectTimer) {
    log(`Scheduling reconnect in ${RECONNECT_INTERVAL/1000} seconds...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToBridge();
    }, RECONNECT_INTERVAL);
  }
}

// Periodically check for updated settings
setInterval(async () => {
  // Only reload settings if we're not in the middle of connecting
  if (!isConnecting) {
    log('Checking for updated cloud settings...');
    await loadCloudSettings();
  }
}, 60000); // Check every minute

// Handle process termination
process.on('SIGINT', () => {
  log('Shutting down agent service...');
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (socket) {
    try {
      socket.disconnect();
    } catch (error) {
      // Ignore errors on close
    }
  }
  
  if (localSocket) {
    try {
      localSocket.disconnect();
    } catch (error) {
      // Ignore errors on close
    }
  }
  
  process.exit(0);
});

// Start the agent service
log('SCADA Cloud Bridge Agent starting...');

// First attempt to load settings from database, then connect
loadCloudSettings().then(() => {
  connectToBridge();
});

log('Agent service running. Press Ctrl+C to exit.');