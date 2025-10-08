import { MongoClient } from 'mongodb';
import { fileLogger } from './logger/FileLogger';
import { backendLogger } from './logger/BackendLogger';
import io from 'socket.io-client';
import { Socket } from 'socket.io-client';
import fetch from 'node-fetch';
import os from 'os';

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scada';
const LOCAL_API_URL = 'http://localhost:3000'; // Next.js API portu
const RECONNECT_INTERVAL = 5000; // Yeniden bağlanma aralığı (ms)
const DEFAULT_BRIDGE_URL = 'http://localhost:4000'; // Default fallback if no settings found

class CloudBridgeAgent {
  private BRIDGE_URL: string = DEFAULT_BRIDGE_URL;
  private socket: Socket | null = null;
  private localSocket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | number | null = null;
  private pingInterval: NodeJS.Timeout | number | null = null; // Ping interval takibi için
  private isConnecting: boolean = false;
  private watchedRegisters: Map<string, any> = new Map(); // key: "analyzerId-address"
  // Track the connection status
  private connectionStatus: 'disconnected' | 'connected' | 'connecting' = 'disconnected';
  // Track event listeners
  private statusChangeListeners: Set<Function> = new Set();
  // Timer for connection status monitoring
  private connectionMonitorTimer: NodeJS.Timeout | null = null;
  // Başlangıç aşamasında durumu daha doğru tespit etmek için
  private initialStatusCheck: boolean = true;

  constructor() {
    fileLogger.info('Cloud Bridge Agent initialized');
  }
  
  // Get current connection status
  public getConnectionStatus(): 'disconnected' | 'connected' | 'connecting' {
    return this.connectionStatus;
  }
  
  // Add event listener for status changes
  public addStatusChangeListener(listener: (status: 'disconnected' | 'connected' | 'connecting') => void): void {
    this.statusChangeListeners.add(listener);
    // Immediately call the listener with current status
    listener(this.connectionStatus);
  }
  
  // Remove event listener
  public removeStatusChangeListener(listener: Function): void {
    this.statusChangeListeners.delete(listener);
  }
  
  // Anlık durumu sürekli değişimi engellemek için gerekli state veriler
  private lastStateChangeTime: number = Date.now();
  private stableConnectionCheckTimer: NodeJS.Timeout | null = null;
  private connectionChecks: { connected: number, disconnected: number } = {
    connected: 0,
    disconnected: 0
  };

  // Notify all listeners about status change
  private emitStatusChange(): void {
    for (const listener of this.statusChangeListeners) {
      listener(this.connectionStatus);
    }
  }

  // Helper function to log messages with timestamps
  private log(message: string, ...args: any[]) {
    const formattedArgs = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg);
    fileLogger.info(`[CloudBridge] ${message} ${formattedArgs.join(' ')}`);
  }

  // Helper function to log errors with timestamps
  private logError(message: string, error: any) {
    fileLogger.error(`[CloudBridge] ERROR: ${message}`, { 
      error: error?.message || String(error), 
      stack: error?.stack 
    });
  }

  // Function to handle API requests from the bridge
  private async handleApiRequest(requestData: any, callback: Function) {
    const { requestId, method, path, body } = requestData;
    
    this.log(`Received API request: ${method} ${path} (ID: ${requestId})`);
    
    try {
      // Build the URL for the local API
      const url = `${LOCAL_API_URL}${path}`;
      
      // Prepare fetch options
      const fetchOptions: any = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        }
      };
      
      // Add body for methods that support it
      if (method !== 'GET' && method !== 'HEAD' && body) {
        fetchOptions.body = JSON.stringify(body);
      }
      
      this.log(`Forwarding request to: ${url}`);
      
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
      } catch (error: any) {
        // Yanıt ayrıştırma hatası durumunda
        const text = await response.text();
        responseData = {
          content: text,
          parseError: error.message,
          isNonJsonResponse: true
        };
      }
      
      this.log(`Received response from local API (ID: ${requestId}), status: ${response.status}, content-type: ${contentType || 'unknown'}`);
      
      // Create response object
      const apiResponse = {
        status: response.status,
        data: responseData
      };
      
      // Send response back using acknowledgment callback
      if (typeof callback === 'function') {
        callback(apiResponse);
      } else if (this.socket) {
        // Fallback if callback is not a function
        this.socket.emit('api-response', {
          requestId,
          ...apiResponse
        });
      }
      
    } catch (error: any) {
      this.logError(`Error handling API request (ID: ${requestId}):`, error);
      
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
      } else if (this.socket) {
        this.socket.emit('api-response', {
          requestId,
          ...errorResponse
        });
      }
    }
  }

  // Function to load cloud settings from MongoDB
  private async loadCloudSettings(): Promise<void> {
    let client: MongoClient | null = null;
    
    try {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      
      const db = client.db();
      const settings = await db.collection('cloud_settings').findOne({});
      
      if (settings && settings.serverIp) {
        // Use HTTP port for Socket.IO connection
        const newUrl = `http://${settings.serverIp}:${settings.httpPort}`;
        
        if (this.BRIDGE_URL !== newUrl) {
          this.log(`Updating Cloud Bridge URL to ${newUrl}`);
          this.BRIDGE_URL = newUrl;
          
          // If we already have a connection and the URL changed, reconnect
          if (this.socket && this.socket.connected) {
            this.log('URL changed, reconnecting...');
            this.socket.disconnect();
          }
        }
      } else {
        this.log('No cloud settings found in database, using default URL');
      }
    } catch (error) {
      this.logError('Error loading cloud settings from database:', error);
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  // Schedule reconnection - çift bağlantı sorununu engellemek için geliştirildi
  private scheduleReconnect(): void {
    if (!this.reconnectTimer) {
      // Bağlanmayı deniyorsak veya zaten bağlıysak, reconnect ihtiyacı yok
      if (this.isConnecting || (this.socket && this.socket.connected)) {
        this.log('Reconnect not needed - already connected or connecting');
        return;
      }
      
      this.log(`Scheduling reconnect in ${RECONNECT_INTERVAL/1000} seconds...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        
        // Timer tetiklendiğinde tekrar kontrol et - belki bu arada bağlanmıştır
        if (!this.socket?.connected && !this.isConnecting) {
          this.log('Executing scheduled reconnect');
          this.connectToBridge();
        } else {
          this.log('Skipping scheduled reconnect - connection already established');
        }
      }, RECONNECT_INTERVAL);
    } else {
      this.log('Reconnect already scheduled, skipping duplicate');
    }
  }
  
  // Update connection status and emit change - with stability checks
  private updateConnectionStatus(status: 'disconnected' | 'connected' | 'connecting'): void {
    // Çok hızlı tekrarlanan durum değişikliklerini önlemek için min bekleme süresi
    const now = Date.now();
    const minTimeBetweenUpdates = 3000; // 3 saniye
    
    // Eğer durum 'connecting' ise her zaman güncelle (geçici durum olduğu için)
    if (status === 'connecting') {
      this.connectionStatus = status;
      this.emitStatusChange();
      this.log(`Connection status changed to: ${status}`);
      this.lastStateChangeTime = now;
      return;
    }
    
    // Bağlantı veya bağlantı kesme durumları için stabilite kontrolü
    if (this.connectionStatus !== status) {
      // Son değişiklikten sonra min zaman geçmişse hemen değiştir
      if (now - this.lastStateChangeTime >= minTimeBetweenUpdates) {
        this.connectionStatus = status;
        this.emitStatusChange();
        this.log(`Connection status changed to: ${status}`);
        this.lastStateChangeTime = now;
        
        // Sayaçları sıfırla
        this.connectionChecks = {
          connected: 0,
          disconnected: 0
        };
      } else {
        // Hızlı değişimlerde, kararlılık için birkaç kez kontrol et
        this.log(`Durum değişikliği talebi alındı (${status}) ancak kararlılık için bekletiliyor`);
      }
    }
  }

  // Function to connect to the bridge
  private async connectToBridge(): Promise<void> {
    // First load the latest settings
    await this.loadCloudSettings();
    
    // Prevent multiple connection attempts
    if (this.isConnecting) return;
    this.isConnecting = true;
    
    // Update status to connecting
    this.updateConnectionStatus('connecting');
    
    // Clear any existing reconnect timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.log(`Connecting to Cloud Bridge at ${this.BRIDGE_URL}...`);
    
    try {
      // Eğer mevcut bir socket varsa önce onu temizle
      if (this.socket) {
        this.socket.removeAllListeners();
        if (this.socket.connected) {
          this.socket.disconnect();
        }
        this.socket = null;
      }
      
      // Connect to the Socket.IO server - sonsuz deneme sayısı korundu
      this.socket = io(this.BRIDGE_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity,    // Sonsuz deneme kalıyor
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      // Local SCADA WebSocket API'sine bağlanma denemesi
      if (!this.localSocket) {
        this.log('Connecting to local SCADA WebSocket API...');
        
        // LOCAL_API_URL'de WebSocket port kullanımı
        // SCADA'nın WebSocket API'si genellikle 3001 portunda çalışır (API portu)
        const localWebSocketUrl = 'http://localhost:3001';
        this.log(`Using WebSocket URL: ${localWebSocketUrl}`);
        
        this.localSocket = io(localWebSocketUrl, {
          reconnection: true,
          reconnectionAttempts: 3,  // Sadece 3 kez dene, sürekli tekrar etme
          reconnectionDelay: 2000,
          timeout: 10000,           // Timeout süresini artır
          path: '/socket.io/',
          transports: ['websocket', 'polling']
        });

        // Register değeri güncellemelerini dinle ve cloud-bridge'e ilet
        this.localSocket.on('register-value', (data) => {
          const registerKey = `${data.analyzerId}-${data.address}`;
          
          // Bu register izleniyorsa bridge'e ilet
          if (this.watchedRegisters.has(registerKey)) {
            this.log(`Received register value update from SCADA: ${registerKey}`);
            
            // Socket bağlı ise, register güncellemesini cloud-bridge'e ilet
            if (this.socket && this.socket.connected) {
              this.socket.emit('forward-register-value', data);
              this.log(`Forwarded register value to cloud bridge: ${registerKey}`);
            }
          }
        });

        this.localSocket.on('connect', () => {
          this.log('Connected to local SCADA WebSocket API');
        });

        this.localSocket.on('disconnect', (reason) => {
          this.log(`Disconnected from local SCADA WebSocket: ${reason}`);
        });

        this.localSocket.on('connect_error', (error) => {
          this.logError('Error connecting to local SCADA WebSocket:', error);
          this.log('NOTE: Agent will continue to work, but real-time register updates will not be available for mobile app');
          this.log('Cloud Bridge HTTP API proxying still works normally');
          
          // Hata durumunda 30 saniye sonra tekrar bağlanmayı deneyelim
          setTimeout(() => {
            if (this.localSocket) {
              this.log('Attempting to reconnect to local SCADA WebSocket API...');
              this.localSocket.connect();
            }
          }, 30000);
        });
      }
      
      // Connection event
      this.socket.on('connect', () => {
        this.log('Connected to Cloud Bridge successfully!');
        this.isConnecting = false;
        // Update status to connected
        this.updateConnectionStatus('connected');
        
        // Send identification data
        this.socket?.emit('identify', {
          version: '1.0.0',
          hostname: os.hostname(),
          platform: process.platform
        });
        
        // Temiz bir kod için önce eski ping interval'ı temizle
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        // Set up ping/pong for keeping connection alive ve referansı sakla
        this.pingInterval = setInterval(() => {
          if (this.socket && this.socket.connected) {
            this.socket.emit('ping');
          }
        }, 30000);
      });
      
      // System messages
      this.socket.on('system', (data) => {
        this.log(`System message from bridge: ${data.message}`);
      });
      
      // API requests
      this.socket.on('api-request', (requestData: any, callback: Function) => {
        this.handleApiRequest(requestData, callback);
      });
      
      // Mobil uygulamadan gelen register izleme istekleri
      this.socket.on('watch-register-mobile', (registerData) => {
        const registerKey = `${registerData.analyzerId}-${registerData.address}`;
        this.log(`Received watch-register request from mobile via bridge: ${registerKey}`);
        
        // Bu register'ı izlenenler listesine ekle
        this.watchedRegisters.set(registerKey, registerData);
        
        // Yerel SCADA WebSocket bağlantısı varsa izleme isteğini ilet
        if (this.localSocket && this.localSocket.connected) {
          this.log(`Forwarding watch-register to local SCADA: ${registerKey}`);
          this.localSocket.emit('watch-register', registerData);
        } else {
          this.log(`Cannot forward watch-register - local WebSocket not connected`);
        }
      });
      
      // Mobil uygulamadan gelen register izlemeyi durdurma istekleri
      this.socket.on('unwatch-register-mobile', (registerData) => {
        const registerKey = `${registerData.analyzerId}-${registerData.address}`;
        this.log(`Received unwatch-register request from mobile via bridge: ${registerKey}`);
        
        // Bu register'ı izlenenler listesinden çıkar
        this.watchedRegisters.delete(registerKey);
        
        // Yerel SCADA WebSocket bağlantısı varsa izlemeyi durdurma isteğini ilet
        if (this.localSocket && this.localSocket.connected) {
          this.log(`Forwarding unwatch-register to local SCADA: ${registerKey}`);
          this.localSocket.emit('unwatch-register', registerData);
        }
      });
      
      // Pong responses
      this.socket.on('pong', (data) => {
        this.log(`Received pong from server: ${data.timestamp}`);
      });
      
      // Disconnection event
      this.socket.on('disconnect', (reason) => {
        this.log(`Connection to Cloud Bridge closed. Reason: ${reason}`);
        this.isConnecting = false;
        // Update status to disconnected
        this.updateConnectionStatus('disconnected');
        
        // Socket.IO automatically tries to reconnect,
        // but we'll set up our own fallback just in case
        this.scheduleReconnect();
      });
      
      // Connection error
      this.socket.on('connect_error', (error) => {
        this.logError('Socket.IO connection error:', error);
        this.isConnecting = false;
        // Update status to disconnected
        this.updateConnectionStatus('disconnected');
        
        // Socket.IO automatically tries to reconnect,
        // but we'll set up our own fallback just in case
        this.scheduleReconnect();
      });
      
    } catch (error) {
      this.logError('Failed to connect to Cloud Bridge:', error);
      this.isConnecting = false;
      // Update status to disconnected
      this.updateConnectionStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Test connection to Cloud Bridge server
   * @param serverUrl Optional server URL to test (format: http://hostname:port)
   * @returns Promise resolving to success status and message
   */
  public async testConnection(serverUrl?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Use provided URL or load from database
      let targetUrl: string;
      
      if (serverUrl) {
        targetUrl = serverUrl;
      } else {
        // Load settings from database
        await this.loadCloudSettings();
        targetUrl = this.BRIDGE_URL;
      }
      
      // Add health endpoint
      if (!targetUrl.endsWith('/')) {
        targetUrl += '/';
      }
      targetUrl += 'health';
      
      this.log(`Testing connection to Cloud Bridge server: ${targetUrl}`);
      
      // Try to fetch health endpoint
      const response = await fetch(targetUrl, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'Accept': 'application/json'
        }
      } as any); // Cast to any to allow timeout
      
      if (response.ok) {
        // Try to parse response as JSON
        try {
          const data = await response.json() as any;
          const status = data && typeof data === 'object' && data.status ? data.status : 'Online';
          
          this.log('Connection test successful', data);
          return {
            success: true,
            message: `Successful connection to Cloud Bridge server (${status})`
          };
        } catch (e) {
          // Non-JSON response but still a 200 OK
          this.log('Connection test successful with non-JSON response');
          return {
            success: true,
            message: 'Successfully connected to Cloud Bridge server'
          };
        }
      } else {
        const errorText = await response.text();
        this.logError(`Connection test failed with status ${response.status}`, errorText);
        return {
          success: false,
          message: `Server responded with error: ${response.status} ${response.statusText}`
        };
      }
    } catch (error: any) {
      this.logError('Connection test failed', error);
      return {
        success: false,
        message: `Cannot connect to Cloud Bridge server: ${error.message || 'Unknown error'}`
      };
    }
  }

  // Public method to start the agent
  public async start(): Promise<void> {
    this.log('SCADA Cloud Bridge Agent starting...');
    
    // First attempt to load settings from database, then connect
    await this.loadCloudSettings();
    await this.connectToBridge();
    
    // Periodically check for updated settings
    setInterval(async () => {
      // Only reload settings if we're not in the middle of connecting
      if (!this.isConnecting) {
        this.log('Checking for updated cloud settings...');
        await this.loadCloudSettings();
      }
    }, 60000); // Check every minute

    this.log('Agent service running.');
  }

  // Public method to stop the agent
  public stop(): void {
    this.log('Shutting down agent service...');
    
    // Tüm timer'ları temizle
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer as NodeJS.Timeout);
      this.connectionMonitorTimer = null;
    }
    
    if (this.stableConnectionCheckTimer) {
      clearInterval(this.stableConnectionCheckTimer as NodeJS.Timeout);
      this.stableConnectionCheckTimer = null;
    }
    
    if (this.socket) {
      try {
        // Event listener'ları temizle
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      } catch (error) {
        // Ignore errors on close
      }
    }
    
    if (this.localSocket) {
      try {
        this.localSocket.removeAllListeners();
        this.localSocket.disconnect();
        this.localSocket = null;
      } catch (error) {
        // Ignore errors on close
      }
    }
    
    // Bağlantı durumunu güncelle
    this.updateConnectionStatus('disconnected');
  }
}

// Export a singleton instance
export const cloudBridgeAgent = new CloudBridgeAgent();