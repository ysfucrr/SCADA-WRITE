import { MongoClient, ChangeStream } from 'mongodb';
import io from 'socket.io-client';
import { Socket } from 'socket.io-client';
import fetch from 'node-fetch';
import os from 'os';

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scada';
const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://localhost:3000'; // Next.js API portu
const RECONNECT_INTERVAL = 5000; // Yeniden bağlanma aralığı (ms)
const DEFAULT_BRIDGE_URL = 'https://localhost:443'; // Default fallback if no settings found - HTTPS only

class CloudBridgeAgent {
  private BRIDGE_URL: string = DEFAULT_BRIDGE_URL;
  private socket: Socket | null = null;
  private localSocket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | number | null = null;
  private pingInterval: NodeJS.Timeout | number | null = null; // Ping interval takibi için
  private isConnecting: boolean = false;
  private watchedRegisters: Set<string> = new Set(); // key: "analyzerId-address" - Set daha hızlı lookup için
  // Track the connection status
  private connectionStatus: 'disconnected' | 'connected' | 'connecting' = 'disconnected';
  // Track event listeners
  private statusChangeListeners: Set<Function> = new Set();
  // Timer for connection status monitoring
  private connectionMonitorTimer: NodeJS.Timeout | null = null;
  // Başlangıç aşamasında durumu daha doğru tespit etmek için
  private initialStatusCheck: boolean = true;
  // Agent name and machine ID for identification with cloud bridge server
  private agentName: string = '';
  private machineId: string = '';
  
  // MongoDB connection pool ve change stream
  private static mongoClient: MongoClient | null = null;
  private settingsChangeStream: ChangeStream | null = null;
  private settingsCheckInterval: NodeJS.Timeout | number | null = null;
  
  // Batch processing için
  private registerUpdateQueue: Array<any> = [];
  private batchTimer: NodeJS.Timeout | number | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_INTERVAL = 100; // ms

  constructor() {
    // Log kaldırıldı - sistem çalışıyor
  }
  
  // Batch processing için register güncellemelerini kuyruğa al
  private queueRegisterUpdate(data: any): void {
    this.registerUpdateQueue.push(data);
    
    // Batch timer yoksa başlat
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.BATCH_INTERVAL) as any;
    }
    
    // Kuyruk çok büyükse hemen işle
    if (this.registerUpdateQueue.length >= this.BATCH_SIZE) {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.processBatch();
    }
  }
  
  // Batch olarak register güncellemelerini gönder
  private processBatch(): void {
    if (this.registerUpdateQueue.length === 0) {
      this.batchTimer = null;
      return;
    }
    
    // Socket bağlı değilse kuyruğu temizle
    if (!this.socket || !this.socket.connected) {
      this.registerUpdateQueue = [];
      this.batchTimer = null;
      return;
    }
    
    // Batch'i al ve kuyruğu temizle
    const batch = this.registerUpdateQueue.splice(0, this.BATCH_SIZE);
    
    // Batch olarak gönder
    if (batch.length === 1) {
      // Tek item varsa normal gönder
      this.socket!.emit('forward-register-value', batch[0]);
    } else {
      // Birden fazla varsa batch olarak gönder
      batch.forEach(data => {
        this.socket!.emit('forward-register-value', data);
      });
    }
    
    // Hala kuyrukta item varsa timer'ı yeniden başlat
    if (this.registerUpdateQueue.length > 0) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.BATCH_INTERVAL) as any;
    } else {
      this.batchTimer = null;
    }
  }
  
  // MongoDB connection pool için singleton client
  private async getMongoClient(): Promise<MongoClient> {
    if (!CloudBridgeAgent.mongoClient) {
      this.log('Creating new MongoDB connection pool...');
      CloudBridgeAgent.mongoClient = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000
      });
      
      await CloudBridgeAgent.mongoClient.connect();
      this.log('MongoDB connection pool established');
      
      // Connection event handlers
      CloudBridgeAgent.mongoClient.on('error', (error) => {
        this.logError('MongoDB connection pool error:', error);
      });
      
      CloudBridgeAgent.mongoClient.on('close', () => {
        this.log('MongoDB connection pool closed');
        CloudBridgeAgent.mongoClient = null;
      });
    }
    
    return CloudBridgeAgent.mongoClient;
  }
  
  // Change Stream ile ayar değişikliklerini izle
  private async watchSettingsChanges(): Promise<void> {
    try {
      const client = await this.getMongoClient();
      const db = client.db();
      const collection = db.collection('cloud_settings');
      
      // Mevcut change stream varsa kapat
      if (this.settingsChangeStream) {
        await this.settingsChangeStream.close();
        this.settingsChangeStream = null;
      }
      
      this.log('Setting up MongoDB Change Stream for cloud_settings...');
      
      // Change stream oluştur
      this.settingsChangeStream = collection.watch(
        [
          {
            $match: {
              $or: [
                { operationType: 'insert' },
                { operationType: 'update' },
                { operationType: 'replace' }
              ]
            }
          }
        ],
        {
          fullDocument: 'updateLookup',
          maxAwaitTimeMS: 10000
        }
      );
      
      // Change event handler
      this.settingsChangeStream.on('change', async (change: any) => {
        this.log('Cloud settings changed, processing update...');
        
        // fullDocument change event'in içinde olabilir
        const newSettings = (change as any).fullDocument;
        if (newSettings && newSettings.serverIp) {
          const newUrl = `https://${newSettings.serverIp}:${newSettings.httpsPort || 443}`;
          
          if (this.BRIDGE_URL !== newUrl) {
            this.log(`Cloud Bridge URL changed from ${this.BRIDGE_URL} to ${newUrl}`);
            this.BRIDGE_URL = newUrl;
            
            // Bağlantı varsa yeniden bağlan
            if (this.socket && this.socket.connected) {
              this.log('Reconnecting with new settings...');
              this.socket.disconnect();
              // Disconnect event handler otomatik olarak yeniden bağlanmayı tetikleyecek
            } else if (this.connectionStatus === 'disconnected') {
              // Bağlı değilse ve yeni ayarlar geldiyse bağlan
              this.log('New settings received, attempting connection...');
              await this.connectToBridge();
            }
          }
        }
      });
      
      this.settingsChangeStream.on('error', (error) => {
        this.logError('Change stream error:', error);
        // Change stream hata verirse yeniden başlat
        setTimeout(() => {
          this.watchSettingsChanges().catch(err => {
            this.logError('Failed to restart change stream:', err);
          });
        }, 5000);
      });
      
      this.settingsChangeStream.on('close', () => {
        this.log('Change stream closed');
        this.settingsChangeStream = null;
      });
      
      this.log('MongoDB Change Stream setup complete');
      
    } catch (error) {
      this.logError('Failed to setup change stream:', error);
      // Hata durumunda fallback olarak periyodik kontrol başlat
      this.startPeriodicSettingsCheck();
    }
  }
  
  // Fallback: Change stream çalışmazsa periyodik kontrol
  private startPeriodicSettingsCheck(): void {
    if (this.settingsCheckInterval) {
      clearInterval(this.settingsCheckInterval);
    }
    
    this.log('Starting periodic settings check as fallback...');
    
    this.settingsCheckInterval = setInterval(async () => {
      if (!this.isConnecting) {
        try {
          const { hasSettings, urlChanged } = await this.loadCloudSettings();
          
          if (hasSettings && (urlChanged || this.connectionStatus === 'disconnected')) {
            this.log('Settings updated (periodic check), attempting connection');
            await this.connectToBridge();
          }
        } catch (error) {
          this.logError('Periodic settings check error:', error);
        }
      }
    }, 60000) as any; // 60 saniye
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

  // Helper function to log messages - NOOP (no operation) for performance
  private log(message: string, ...args: any[]) {
    // Temporarily enable logs for debugging
    console.log(`[CloudBridge] ${message}`, ...args);
  }

  // Helper function to log errors - Only critical errors
  private logError(message: string, error: any) {
    console.error(`[CloudBridge] ERROR: ${message}`, error?.message || error);
  }

  // Function to handle API requests from the bridge
  private async handleApiRequest(requestData: any, callback: Function) {
    const { requestId, method, path, body } = requestData;

    this.log(`Handling API request: ${method} ${path} (ID: ${requestId})`);
    this.log(`Request data:`, requestData);
    this.log(`Callback type: ${typeof callback}`);
    
    try {
      // Build the URL for the local API
      const url = `${LOCAL_API_URL}${path}`;
      
      this.log(`Full URL: ${url}`);
      
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
        this.log(`Request body: ${fetchOptions.body}`);
      }
      
      this.log(`Making request to local API...`);

      // Make the request to the local API
      const response = await fetch(url, fetchOptions);
      
      this.log(`Response received - Status: ${response.status}, StatusText: ${response.statusText}`);
      
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
      
      console.log(`[CloudBridge] Local API response: ${response.status} for request ${requestId}`);
      console.log(`[CloudBridge] Response data:`, JSON.stringify(responseData).substring(0, 200));
      
      // Create response object
      const apiResponse = {
        status: response.status,
        data: responseData
      };
      
      // Send response back using acknowledgment callback
      if (typeof callback === 'function') {
        console.log(`[CloudBridge] Sending response via callback for request ${requestId}`);
        try {
          callback(apiResponse);
          console.log(`[CloudBridge] Callback executed successfully for request ${requestId}`);
        } catch (callbackError) {
          console.error(`[CloudBridge] Error executing callback for request ${requestId}:`, callbackError);
        }
      } else {
        console.log(`[CloudBridge] No callback function available for request ${requestId}, using emit fallback`);
        if (this.socket) {
          this.socket.emit('api-response', {
            requestId,
            ...apiResponse
          });
          console.log(`[CloudBridge] Response emitted via socket for request ${requestId}`);
        } else {
          console.error(`[CloudBridge] No socket available to send response for request ${requestId}`);
        }
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
        console.log(`[CloudBridge] Sending error response via callback for request ${requestId}`);
        try {
          callback(errorResponse);
          console.log(`[CloudBridge] Error callback executed successfully for request ${requestId}`);
        } catch (callbackError) {
          console.error(`[CloudBridge] Error executing error callback for request ${requestId}:`, callbackError);
        }
      } else {
        console.log(`[CloudBridge] No callback function for error response ${requestId}, using emit fallback`);
        if (this.socket) {
          this.socket.emit('api-response', {
            requestId,
            ...errorResponse
          });
          console.log(`[CloudBridge] Error response emitted via socket for request ${requestId}`);
        } else {
          console.error(`[CloudBridge] No socket available to send error response for request ${requestId}`);
        }
      }
    }
  }

  // Function to load cloud settings from MongoDB (artık pooled connection kullanıyor)
  private async loadCloudSettings(): Promise<{ hasSettings: boolean, urlChanged: boolean }> {
    let hasSettings = false;
    let urlChanged = false;
    let agentNameChanged = false;
    let machineIdChanged = false;
    
    try {
      const client = await this.getMongoClient();
      const db = client.db();
      const settings = await db.collection('cloud_settings').findOne({});
      
      if (settings && settings.serverIp) {
        hasSettings = true;
        // Always use HTTPS for Socket.IO connection
        const newUrl = `https://${settings.serverIp}:${settings.httpsPort || 443}`;
        
        // Check for URL change
        if (this.BRIDGE_URL !== newUrl) {
          this.log(`Updating Cloud Bridge URL to ${newUrl}`);
          this.BRIDGE_URL = newUrl;
          urlChanged = true;
          
          // If we already have a connection and the URL changed, reconnect
          if (this.socket && this.socket.connected) {
            this.log('URL changed, reconnecting...');
            this.socket.disconnect();
          }
        }
        
        // Check for agent name change
        if (settings.agentName && this.agentName !== settings.agentName) {
          this.log(`Updating Agent Name from "${this.agentName}" to "${settings.agentName}"`);
          this.agentName = settings.agentName;
          agentNameChanged = true;
          
          // If agent name changed and we're connected, should reconnect to update identity
          if (agentNameChanged && this.socket && this.socket.connected) {
            this.log('Agent name changed, reconnecting to update identity...');
            this.socket.disconnect();
          }
        }
        
        // Check for machine ID change
        if (settings.machineId && this.machineId !== settings.machineId) {
          this.log(`Updating Machine ID from "${this.machineId}" to "${settings.machineId}"`);
          this.machineId = settings.machineId;
          machineIdChanged = true;
          
          // If machine ID changed and we're connected, should reconnect to update identity
          if (machineIdChanged && this.socket && this.socket.connected) {
            this.log('Machine ID changed, reconnecting to update identity...');
            this.socket.disconnect();
          }
        }
      } else {
        this.log('No cloud settings found in database, will not attempt connection');
        hasSettings = false;
      }
    } catch (error) {
      this.logError('Error loading cloud settings from database:', error);
      hasSettings = false;
      urlChanged = false;
    }
    // Artık client'ı kapatmıyoruz, pool'da kalıyor
    
    return { hasSettings, urlChanged };
  }

  // Schedule reconnection - çift bağlantı sorununu engellemek için geliştirildi
  private scheduleReconnect(): void {
    // Önce mevcut timer'ı temizle
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Bağlanmayı deniyorsak veya zaten bağlıysak, reconnect ihtiyacı yok
    if (this.isConnecting || (this.socket && this.socket.connected)) {
      this.log('Reconnect not needed - already connected or connecting');
      return;
    }
    
    this.log(`Scheduling reconnect in ${RECONNECT_INTERVAL/1000} seconds...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      // Timer tetiklendiğinde tekrar kontrol et - belki bu arada bağlanmıştır
      if (!this.socket?.connected && !this.isConnecting) {
        this.log('Executing scheduled reconnect');
        
        // Önce sunucunun erişilebilir olup olmadığını kontrol et
        try {
          const testResult = await this.testConnection();
          if (testResult.success) {
            this.log('Server is reachable, attempting reconnect');
            await this.connectToBridge();
          } else {
            this.log(`Server not reachable: ${testResult.message}, will retry later`);
            // Sunucu erişilemezse tekrar dene
            this.scheduleReconnect();
          }
        } catch (error) {
          this.logError('Error testing connection:', error);
          this.scheduleReconnect();
        }
      } else {
        this.log('Skipping scheduled reconnect - connection already established');
      }
    }, RECONNECT_INTERVAL) as any;
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
    const { hasSettings } = await this.loadCloudSettings();
    
    // Eğer hiç ayar yoksa bağlantı denemesi yapma
    if (!hasSettings) {
      this.log('No cloud settings found, skipping connection attempt');
      this.updateConnectionStatus('disconnected');
      return;
    }
    
    // Prevent multiple connection attempts
    if (this.isConnecting) {
      this.log('Already connecting, skipping duplicate connection attempt');
      return;
    }
    
    // Eğer zaten bağlıysak, yeni bağlantı oluşturma
    if (this.socket && this.socket.connected) {
      this.log('Already connected, skipping connection attempt');
      return;
    }
    
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
        this.log('Cleaning up existing socket before new connection');
        this.socket.removeAllListeners();
        if (this.socket.connected) {
          this.socket.disconnect();
        }
        this.socket = null;
        
        // Socket'in tamamen kapanması için kısa bir süre bekle
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Connect to the Socket.IO server - reconnection KAPALI
      this.socket = io(this.BRIDGE_URL, {
        reconnection: false,  // Socket.IO'nun kendi reconnect'ini KAPAT
        timeout: 20000,
        forceNew: true, // Her yeni bağlantıda yeni instance oluştur
        transports: ['websocket', 'polling'], // Transport önceliğini belirle
        path: '/socket.io/', // Explicit path belirt
        query: {
          type: 'agent' // Agent olduğumuzu belirt, sunucu mobile client'tan ayırt edebilsin
        }
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

        // Register değeri güncellemelerini dinle ve batch için kuyruğa al
        this.localSocket.on('register-value', (data) => {
          const registerKey = `${data.analyzerId}-${data.address}`;
          
          // Bu register izleniyorsa kuyruğa ekle - Set.has() O(1) performans
          if (this.watchedRegisters.has(registerKey)) {
            this.queueRegisterUpdate(data);
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
        
        // Send identification data with agent name and machine ID
        this.socket?.emit('identify', {
          version: '1.0.0',
          hostname: os.hostname(),
          platform: process.platform,
          agentName: this.agentName || `SCADA-${os.hostname()}`, // Use agent name if available, or fallback to hostname
          machineId: this.machineId // Include machine ID for persistent identification
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

      // API requests - callback her zaman olmalı
      this.socket.on('api-request', async (requestData: any, callback?: Function) => {
        const { requestId, method, path } = requestData;
        this.log(`Received API request: ${method} ${path} (ID: ${requestId})`);
        
        // Callback'i kontrol et ve log'la
        console.log('[CloudBridgeAgent] API request callback check:', {
          requestId,
          hasCallback: typeof callback === 'function',
          callbackType: typeof callback
        });
        
        // Callback yoksa bile devam et ama uyar
        if (typeof callback !== 'function') {
          console.warn(`[CloudBridgeAgent] No callback function provided for API request ${requestId}`);
          // Fallback olarak boş bir fonksiyon kullan
          callback = (response: any) => {
            console.log(`[CloudBridgeAgent] Fallback callback called for ${requestId}:`, response);
            // Socket üzerinden gönder
            if (this.socket && this.socket.connected) {
              this.socket.emit('api-response', {
                requestId,
                ...response
              });
            }
          };
        }
        
        // API isteğini işle
        try {
          await this.handleApiRequest(requestData, callback);
        } catch (error: any) {
          console.error(`[CloudBridgeAgent] Error in api-request handler for ${requestId}:`, error);
          // Hata durumunda da callback'i çağır
          if (typeof callback === 'function') {
            callback({
              status: 500,
              data: { error: 'Internal server error', message: error?.message || 'Unknown error' }
            });
          }
        }
      });
      
      // Mobil uygulamadan gelen register izleme istekleri
      this.socket.on('watch-register-mobile', (registerData) => {
        const registerKey = `${registerData.analyzerId}-${registerData.address}`;
        
        // Bu register'ı izlenenler listesine ekle - Set.add() O(1) performans
        this.watchedRegisters.add(registerKey);
        
        // Yerel SCADA WebSocket bağlantısı varsa izleme isteğini ilet
        if (this.localSocket && this.localSocket.connected) {
          this.localSocket.emit('watch-register', registerData);
        }
      });
      
      // Mobil uygulamadan gelen register izlemeyi durdurma istekleri
      this.socket.on('unwatch-register-mobile', (registerData) => {
        const registerKey = `${registerData.analyzerId}-${registerData.address}`;
        
        // Bu register'ı izlenenler listesinden çıkar - Set.delete() O(1) performans
        this.watchedRegisters.delete(registerKey);
        
        // Yerel SCADA WebSocket bağlantısı varsa izlemeyi durdurma isteğini ilet
        if (this.localSocket && this.localSocket.connected) {
          this.localSocket.emit('unwatch-register', registerData);
        }
      });
      
      // Ping requests from server
      this.socket.on('ping', (callback) => {
        // Respond to ping immediately
        if (typeof callback === 'function') {
          callback();
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
        
        // Ping interval'ı temizle
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        // Sadece kendi reconnect mekanizmamızı kullan
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
      
      // Socket.IO reconnection kapalı olduğu için bu event'ler artık gelmeyecek
      // Bunları kaldırıyoruz
      
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
  public async testConnection(serverUrl?: string, forceConnect: boolean = false): Promise<{ success: boolean; message: string }> {
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
    const { hasSettings } = await this.loadCloudSettings();
    
    // Sadece ayarlar mevcutsa bağlantı denemesi yap
    if (hasSettings) {
      await this.connectToBridge();
    } else {
      this.log('No cloud settings found, agent is waiting for settings to be configured');
      this.updateConnectionStatus('disconnected');
    }
    
    // Change Stream'i başlat
    await this.watchSettingsChanges();
    
    // Periyodik bağlantı kontrolü başlat (her 30 saniyede bir)
    setInterval(() => {
      if (this.connectionStatus === 'connected' && this.socket) {
        // Bağlı görünüyoruz ama gerçekten bağlı mıyız kontrol et
        if (!this.socket.connected) {
          this.log('Socket appears disconnected but status is connected, updating status');
          this.updateConnectionStatus('disconnected');
          this.scheduleReconnect();
        }
      } else if (this.connectionStatus === 'disconnected' && !this.isConnecting) {
        // Bağlı değiliz ve bağlanmaya çalışmıyoruz
        this.log('Periodic check: Not connected, attempting reconnect');
        this.scheduleReconnect();
      }
    }, 30000);

    this.log('Agent service running.');
  }
  
  // Public method to force reconnection (for after saving settings)
  public async reconnect(): Promise<void> {
    this.log('Force reconnection requested (after settings changed)');
    
    // If already connected, disconnect first
    if (this.socket && this.socket.connected) {
      this.log('Disconnecting existing connection before reconnect');
      this.socket.disconnect();
    }
    
    // Attempt to connect with new settings
    await this.connectToBridge();
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
    
    if (this.settingsCheckInterval) {
      clearInterval(this.settingsCheckInterval);
      this.settingsCheckInterval = null;
    }
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Kuyruğu temizle
    this.registerUpdateQueue = [];
    
    // Change stream'i kapat
    if (this.settingsChangeStream) {
      this.settingsChangeStream.close().catch(err => {
        this.logError('Error closing change stream:', err);
      });
      this.settingsChangeStream = null;
    }
    
    // MongoDB connection pool'u kapat
    if (CloudBridgeAgent.mongoClient) {
      CloudBridgeAgent.mongoClient.close().catch(err => {
        this.logError('Error closing MongoDB connection:', err);
      });
      CloudBridgeAgent.mongoClient = null;
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