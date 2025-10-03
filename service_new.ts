// import * as dotenv from 'dotenv';
// dotenv.config({ path: '.env.local' });
/* eslint-disable @typescript-eslint/no-explicit-any */
const dotenv = require('dotenv');
import path from 'path';
import fs from 'fs';
import { fileLogger } from './src/lib/logger/FileLogger';
import { redisClient, connectRedis, disconnectRedis } from './src/lib/redis';

// Loglama başlangıcı
fileLogger.info('--- Service Process Starting ---');
fileLogger.info(`isPackaged: ${!process.env.npm_config_development}`);
fileLogger.info(`cwd: ${process.cwd()}`);
fileLogger.info(`__dirname: ${__dirname}`);
fileLogger.info(`Log file path: ${fileLogger.getLogPath()}`);

// .env dosyasını doğru yerden yükle
const isPackaged = process.env.IS_PACKAGED === 'true' || (process.env.NODE_ENV === 'production' && !(process.env as any).npm_config_development);

const envPath = isPackaged
    ? path.join((process as any).resourcesPath, 'app', '.env.local')
    : path.join(process.cwd(), '.env.local');

fileLogger.info(`Attempting to load .env from: ${envPath}`);

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    fileLogger.info('.env.local loaded successfully', {
        NEXTAUTH_SECRET_LOADED: process.env.NEXTAUTH_SECRET ? 'Yes' : 'No',
        SERVICE_PORT: process.env.SERVICE_PORT || 'Not Set'
    });
} else {
    fileLogger.warn('.env.local not found at expected path.');
}

import { TrendLoggerService } from "./src/lib/trend-logger-service_new";
import { ModbusPoller } from "./src/lib/modbus/ModbusPoller";
import { backendLogger } from "./src/lib/logger/BackendLogger";
import { periodicReportService } from "./src/lib/periodic-report-service";

import { mailService } from "./src/lib/mail-service";

// Re-export redisClient for other modules
export { redisClient };
import { alertManager } from "./src/lib/alert-manager";

// Cloud bridge scheduler
let cloudSyncInterval: any = null;

const startCloudSync = () => {
  if (cloudSyncInterval) {
    clearInterval(cloudSyncInterval);
  }

  if (!cloudSettings?.isEnabled) {
    return;
  }

  // Her 30 saniyede bir SCADA verilerini cloud'a senkronize et
  cloudSyncInterval = setInterval(async () => {
    try {
      await syncAllDataToCloud();
    } catch (error) {
      fileLogger.error('Cloud sync error', { error: (error as Error).message });
    }
  }, 30000);

  fileLogger.info('Cloud sync scheduler started', { interval: '30 seconds' });
};

const stopCloudSync = () => {
  if (cloudSyncInterval) {
    clearInterval(cloudSyncInterval);
    cloudSyncInterval = null;
    fileLogger.info('Cloud sync scheduler stopped');
  }
};

const syncAllDataToCloud = async () => {
  if (!cloudSettings?.isEnabled || !cloudSocket?.connected) {
    return;
  }

  try {
    const { db } = await connectToDatabase();

    // Buildings ve registerları al
    const buildings = await db.collection('buildings').find({}).toArray();
    if (buildings.length > 0) {
      await sendRegistersToCloud(buildings);
    }

    // Analyzers'ı al
    const analyzers = await db.collection('analyzers').find({}).toArray();
    if (analyzers.length > 0) {
      await sendAnalyzersToCloud(analyzers);
    }

    // Widgets'ı al
    const widgets = await db.collection('widgets').find({}).toArray();
    if (widgets.length > 0) {
      sendDataToCloud('/api/scada/widgets', { widgets });
    }

    // Trend logs'u al
    const trendLogs = await db.collection('trendLogs').find({}).toArray();
    if (trendLogs.length > 0) {
      sendDataToCloud('/api/scada/trend-logs', { trendLogs });
    }

    // Sistem bilgilerini de gönder
    await sendSystemInfoToCloud();

    fileLogger.info('All SCADA data synced to cloud', {
      buildings: buildings.length,
      analyzers: analyzers.length,
      widgets: widgets.length,
      trendLogs: trendLogs.length
    });

  } catch (error) {
    fileLogger.error('Failed to sync data to cloud', { error: (error as Error).message });
  }
};

const watchCloudSettings = async () => {
  try {
    const { db } = await connectToDatabase();
    const changeStream = db.collection('cloud_settings').watch([
      { $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }
    ]);

    changeStream.on('change', async (change) => {
      if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
        const newSettings = change.fullDocument || change.documentKey;
        
        // IP adresindeki boşlukları temizle
        if (newSettings.serverIP) {
          newSettings.serverIP = newSettings.serverIP.trim();
        }

        fileLogger.info('Cloud settings changed', {
          operation: change.operationType,
          isEnabled: newSettings.isEnabled,
          serverIP: newSettings.serverIP
        });

        // Önceki bağlantıyı temizle
        if (cloudSocket) {
          cloudSocket.disconnect();
          cloudSocket = null;
        }

        stopCloudSync();

        // Yeni ayarları yükle
        if (newSettings.isEnabled && newSettings.serverIP) {
          cloudSettings = newSettings;
          connectToCloudServer();
          startCloudSync();

          // Yeni bağlantı ile tüm veriyi senkronize et
          setTimeout(() => {
            syncAllDataToCloud();
          }, 2000);
        } else {
          cloudSettings = null;
        }
      }
    });

    changeStream.on('error', (err) => {
      fileLogger.error(`Cloud settings change stream error: ${err.message}`, "CloudWatcher");
      // Bir süre sonra yeniden bağlanmayı dene
      setTimeout(watchCloudSettings, 5000);
    });

  } catch (err) {
    fileLogger.error(`Failed to watch cloud settings: ${(err as Error).message}`, "CloudWatcher");
    // Bir süre sonra yeniden bağlanmayı dene
    setTimeout(watchCloudSettings, 5000);
  }
};
import { Socket } from 'socket.io';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectToDatabase } from "./src/lib/mongodb";
import { ObjectId } from "mongodb";
import { setServerSocket } from './src/lib/socket-io-server';
export const modbusPoller = new ModbusPoller();
const trendLoggerInstance = new TrendLoggerService();

// Cloud bridge için WebSocket client
let cloudSocket: any = null;
let cloudSettings: any = null;

// Bridge server bağlantı durumu
let isConnectedToBridge = false;

// Cloud bridge fonksiyonları
const initializeCloudBridge = async () => {
  try {
    const { db } = await connectToDatabase();
    const settings = await db.collection('cloud_settings').findOne({ type: 'cloud_settings' });

    if (!settings || !settings.isEnabled || !settings.serverIP) {
      fileLogger.info('Cloud bridge disabled or not configured');
      return;
    }
    
    // IP adresindeki boşlukları temizle
    if (settings.serverIP) {
      settings.serverIP = settings.serverIP.trim();
      fileLogger.info(`Cloud bridge settings loaded. IP: ${settings.serverIP}, Port: ${settings.serverPort}`);
    }

    cloudSettings = settings;
    connectToCloudServer();

  } catch (error) {
    fileLogger.error('Failed to initialize cloud bridge', { error: (error as Error).message });
  }
};

const connectToCloudServer = () => {
  if (!cloudSettings || !cloudSettings.isEnabled) {
    return;
  }

  try {
    const { io } = require('socket.io-client');

    // URL oluşturmadan önce protokol kontrolü yap
    const serverIP = cloudSettings.serverIP.trim();
    const cloudUrl = serverIP.startsWith('http://') || serverIP.startsWith('https://')
      ? `${serverIP}:${cloudSettings.serverPort}`
      : `http://${serverIP}:${cloudSettings.serverPort}`;
    fileLogger.info(`Connecting to bridge server: ${cloudUrl}`, {
      serverIP: serverIP, // Temizlenmiş IP adresini kullan
      serverPort: cloudSettings.serverPort,
      timestamp: new Date().toISOString()
    });

    cloudSocket = io(cloudUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000, // 20 saniye timeout
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: false,
      rejectUnauthorized: false
    });

    // Daha detaylı event logging
    cloudSocket.on('connecting', (transport: any) => {
      fileLogger.info('Bridge server connecting...', { transport });
    });

    cloudSocket.on('connect', () => {
      isConnectedToBridge = true;
      fileLogger.info('Bridge server connected successfully', {
        serverIP: cloudSettings.serverIP.trim(), // Temizlenmiş IP adresini kullan
        serverPort: cloudSettings.serverPort,
        socketId: cloudSocket.id,
        transport: (cloudSocket as any).io.engine.transport.name
      });

      // SCADA olarak kendini tanıt
      cloudSocket.emit('identify', {
        type: 'scada',
        source: `scada-${require('os').hostname()}`
      });

      // Kısa süre sonra mevcut verileri senkronize et
      setTimeout(() => {
        syncAllDataToBridge();
      }, 1500);
    });

    cloudSocket.on('disconnect', (reason: string) => {
      isConnectedToBridge = false;
      fileLogger.warn('Bridge server disconnected', {
        reason,
        serverIP: cloudSettings.serverIP.trim(), // Temizlenmiş IP adresini kullan
        serverPort: cloudSettings.serverPort
      });
    });

    cloudSocket.on('connect_error', (error: any) => {
      isConnectedToBridge = false;
      fileLogger.error('Bridge server connection error', {
        error: error.message,
        errorType: error.type,
        description: error.description,
        context: error.context,
        serverIP: cloudSettings.serverIP.trim(), // Temizlenmiş IP adresini kullan
        serverPort: cloudSettings.serverPort,
        timestamp: new Date().toISOString()
      });
    });

    cloudSocket.on('reconnect_attempt', (attemptNumber: any) => {
      fileLogger.info('Bridge server reconnection attempt', { attemptNumber });
    });

    cloudSocket.on('reconnect', (attemptNumber: any) => {
      fileLogger.info('Bridge server reconnected successfully', { attemptNumber });
    });

    cloudSocket.on('reconnect_failed', () => {
      fileLogger.error('Bridge server reconnection failed after all attempts');
    });

    // Köprü sunucusundan gelen mobil yazma isteklerini dinle
    cloudSocket.on('mobile-write-request', (data: any) => {
      fileLogger.info('Mobile write request received from bridge', {
        registerId: data.registerId,
        value: data.value,
        mobileSocketId: data.mobileSocketId
      });
      // SCADA'da register yazma işlemi yap
      handleMobileWriteRequest(data);
    });

    // Genel event listener
    cloudSocket.onAny((eventName: any, ...args: any[]) => {
      fileLogger.info('Bridge server event received', { eventName, argsLength: args.length });
    });

  } catch (error) {
    fileLogger.error('Failed to create bridge socket connection', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      serverIP: cloudSettings.serverIP.trim(), // Temizlenmiş IP adresini kullan
      serverPort: cloudSettings.serverPort
    });
  }
};

const sendDataToCloud = (endpoint: string, data: any) => {
  if (!cloudSocket || !cloudSocket.connected || !cloudSettings?.isEnabled) {
    return false;
  }

  try {
    // HTTP POST isteğini WebSocket üzerinden gönder
    cloudSocket.emit('scada-data', {
      endpoint,
      data,
      timestamp: new Date().toISOString()
    });

    fileLogger.info('Data sent to bridge', { endpoint, dataSize: JSON.stringify(data).length });
    return true;

  } catch (error) {
    fileLogger.error('Failed to send data to bridge', { error: (error as Error).message, endpoint });
    return false;
  }
};

// Köprü sunucusuna tüm verileri senkronize et
const syncAllDataToBridge = async () => {
  if (!isConnectedToBridge || !cloudSettings?.isEnabled) {
    return;
  }

  try {
    fileLogger.info('Syncing all data to bridge server');

    const { db } = await connectToDatabase();

    // Buildings ve registerları al ve gönder
    const buildings = await db.collection('buildings').find({}).toArray();
    if (buildings.length > 0) {
      await sendRegistersToCloud(buildings);
    }

    // Analyzers'ı al ve gönder
    const analyzers = await db.collection('analyzers').find({}).toArray();
    if (analyzers.length > 0) {
      await sendAnalyzersToCloud(analyzers);
    }

    // Widgets'ı al ve gönder
    const widgets = await db.collection('widgets').find({}).toArray();
    if (widgets.length > 0) {
      sendDataToCloud('/api/scada/widgets', { widgets });
    }

    // Trend logs'u al ve gönder
    const trendLogs = await db.collection('trendLogs').find({}).toArray();
    if (trendLogs.length > 0) {
      sendDataToCloud('/api/scada/trend-logs', { trendLogs });
    }

    fileLogger.info('All data synced to bridge server successfully');

  } catch (error) {
    fileLogger.error('Failed to sync data to bridge', { error: (error as Error).message });
  }
};

// Mobil uygulamadan gelen yazma isteklerini işle
const handleMobileWriteRequest = async (data: any) => {
  try {
    const { registerId, value, mobileSocketId } = data;

    fileLogger.info('Processing mobile write request', { registerId, value, mobileSocketId });

    // Önce register'ı bul
    const { db } = await connectToDatabase();
    const buildings = await db.collection('buildings').find({}).toArray();

    let targetRegister = null;
    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes) {
        const registerNode = building.flowData.nodes.find((node: any) =>
          node.type === 'registerNode' && node.id === registerId
        );
        if (registerNode) {
          targetRegister = registerNode;
          break;
        }
      }
    }

    if (!targetRegister) {
      fileLogger.error('Register not found for mobile write request', { registerId });
      // Hata response'u gönder
      if (cloudSocket && mobileSocketId) {
        cloudSocket.emit('write-response', {
          success: false,
          registerId,
          error: 'Register not found',
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    // Yazma isteğini oluştur
    const writeRequest = {
      registerId,
      value: Number(value),
      timestamp: new Date(),
      source: 'mobile-via-bridge',
      status: 'pending',
      mobileSocketId
    };

    // MongoDB'ye kaydet
    const result = await db.collection('write_requests').insertOne(writeRequest);

    if (result.insertedId) {
      fileLogger.info('Mobile write request saved to database', { registerId, value });

      // Köprü sunucusuna başarı response'u gönder
      if (cloudSocket) {
        cloudSocket.emit('write-response', {
          success: true,
          registerId,
          value: Number(value),
          requestId: result.insertedId.toString(),
          timestamp: new Date().toISOString()
        });
      }
    }

  } catch (error) {
    fileLogger.error('Failed to handle mobile write request', { error: (error as Error).message });

    // Hata response'u gönder
    if (cloudSocket) {
      cloudSocket.emit('write-response', {
        success: false,
        registerId: data.registerId,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  }
};

backendLogger.info('Service starting...', 'Server', {
  authSecret: process.env.NEXTAUTH_SECRET ? 'Loaded' : 'Not Loaded'
});
const port = process.env.SERVICE_PORT || 3001;
const expressApp = express();
const server = createServer(expressApp);

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin: any, callback: any) => {
      callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  path: '/socket.io/',
  pingTimeout: 60000
});

setServerSocket(io); // Make the socket instance globally available

const logNamespace = io.of('/logs');
backendLogger.setSocketIO(logNamespace);
backendLogger.setConsoleOutput(false);

const connections = new Map<string, Socket>();
const subscriptions = new Map<string, Set<string>>();

const getRegisterKey = (data: { analyzerId: string | number; address: string | number; dataType: string; bit?: number }): string => {
  return data.dataType === 'boolean' && typeof data.bit === 'number'
    ? `${data.analyzerId}-${data.address}-bit${data.bit}`
    : `${data.analyzerId}-${data.address}`;
};

// SCADA verilerini cloud'a gönderecek fonksiyonlar
const sendRegistersToCloud = async (buildings: any[]) => {
  if (!cloudSettings?.isEnabled) return;

  try {
    const allRegisters: any[] = [];

    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes && Array.isArray(building.flowData.nodes)) {
        const registerNodes = building.flowData.nodes.filter((node: any) =>
          node.type === 'registerNode' && node.data
        );

        registerNodes.forEach((node: any) => {
          const register = {
            _id: node.id,
            name: node.data.label || `Register ${node.data.address}`,
            buildingId: building._id.toString(),
            buildingName: building.name,
            analyzerId: node.data.analyzerId,
            analyzerName: `Analyzer ${node.data.analyzerId}`,
            address: node.data.address,
            dataType: node.data.dataType,
            scale: node.data.scale || 1,
            scaleUnit: node.data.scaleUnit || '',
            byteOrder: node.data.byteOrder,
            unit: node.data.scaleUnit || '',
            description: `${building.name} - ${node.data.label}`,
            registerType: node.data.registerType || 'read',
            offset: node.data.offset || 0,
            displayMode: node.data.displayMode || 'digit',
            fontFamily: node.data.fontFamily,
            textColor: node.data.textColor,
            backgroundColor: node.data.backgroundColor,
            opacity: node.data.opacity,
            status: 'active',
            position: node.position,
            style: node.style
          };

          allRegisters.push(register);
        });
      }
    }

    if (allRegisters.length > 0) {
      sendDataToCloud('/api/scada/registers', {
        registers: allRegisters,
        buildingsProcessed: buildings.length
      });
    }

  } catch (error) {
    fileLogger.error('Failed to send registers to cloud', { error: (error as Error).message });
  }
};

const sendAnalyzersToCloud = async (analyzers: any[]) => {
  if (!cloudSettings?.isEnabled) return;

  try {
    // Önce bina bilgilerini al
    const { db } = await connectToDatabase();
    const buildings = await db.collection('buildings').find({}).toArray();
    
    // Analizörlerin hangi binaya ait olduğunu bulmak için yardımcı harita
    const analyzerToBuildingMap = new Map();
    
    // Her binanın flowData içindeki register node'larından analizör-bina ilişkisini belirle
    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes && Array.isArray(building.flowData.nodes)) {
        const registerNodes = building.flowData.nodes.filter((node: any) =>
          node.type === 'registerNode' && node.data && node.data.analyzerId
        );
        
        // Her register node için analizör ID'sini ve bina bilgisini eşleştir
        registerNodes.forEach((node: any) => {
          const analyzerId = node.data.analyzerId;
          if (analyzerId) {
            analyzerToBuildingMap.set(analyzerId.toString(), {
              buildingId: building._id.toString(),
              buildingName: building.name
            });
          }
        });
      }
    }
    
    // Analizör verilerini bina bilgisi ekleyerek formatlayıp gönder
    const formattedAnalyzers = analyzers.map(analyzer => {
      // Bu analizöre ait bina bilgisini bul
      const buildingInfo = analyzerToBuildingMap.get(analyzer.slaveId?.toString()) || {
        buildingId: null,
        buildingName: "Unknown Building"
      };
      
      return {
        _id: analyzer._id.toString(),
        name: analyzer.name,
        slaveId: analyzer.slaveId,
        model: analyzer.model,
        connection: analyzer.connection,
        gateway: analyzer.gateway,
        isActive: analyzer.isActive !== false,
        registers: analyzer.registers || [],
        createdAt: analyzer.createdAt ? new Date(analyzer.createdAt).toISOString() : null,
        // Bina bilgilerini ekle
        buildingId: buildingInfo.buildingId,
        buildingName: buildingInfo.buildingName
      };
    });

    if (formattedAnalyzers.length > 0) {
      fileLogger.info('Sending analyzers to cloud with building info', {
        analyzersCount: formattedAnalyzers.length,
        buildingsProcessed: buildings.length,
        mappedAnalyzers: analyzerToBuildingMap.size
      });
      
      sendDataToCloud('/api/scada/analyzers', {
        analyzers: formattedAnalyzers
      });
    }

  } catch (error) {
    fileLogger.error('Failed to send analyzers to cloud', { error: (error as Error).message });
  }
};

// Sistem bilgilerini köprü sunucusuna gönder
const sendSystemInfoToCloud = async () => {
  if (!cloudSettings?.isEnabled) return;

  try {
    const { db } = await connectToDatabase();
    
    // MongoDB istatistikleri
    const dbStats = await db.stats();
    
    // Collection istatistikleri
    const collections = await db.listCollections().toArray();
    const collectionStats = [];
    
    for (const collection of collections) {
      try {
        const count = await db.collection(collection.name).countDocuments();
        const estimatedSize = count * 0.001; // Yaklaşık MB
        
        collectionStats.push({
          name: collection.name,
          size: estimatedSize,
          count: count
        });
      } catch (error) {
        // Bazı collection'lar erişilemeyebilir
        console.warn(`Could not get stats for collection ${collection.name}`);
      }
    }

    // Sistem bilgileri
    const os = require('os');
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // Temel sistem bilgilerini topla
    const analyzersCount = await db.collection('analyzers').countDocuments({
      isActive: { $ne: false }
    });
    
    const alertsCount = await db.collection('alert_rules').countDocuments({
      isActive: true
    });
    
    const systemInfo = {
      status: 'running',
      uptime: process.uptime(),
      activeAnalyzers: analyzersCount,
      alarms: alertsCount,
      lastUpdate: new Date().toISOString(),
      timestamp: Date.now(),
      success: true,
      mongodb: {
        dbStats: {
          db: dbStats.db,
          collections: dbStats.collections,
          views: dbStats.views || 0,
          objects: dbStats.objects,
          dataSize: dbStats.dataSize / (1024 * 1024), // MB
          storageSize: dbStats.storageSize / (1024 * 1024), // MB
          indexes: dbStats.indexes,
          indexSize: dbStats.indexSize / (1024 * 1024) // MB
        },
        collectionStats: collectionStats
      },
      system: {
        totalMemory: (totalMemory / (1024 * 1024 * 1024)).toFixed(2), // GB
        freeMemory: (freeMemory / (1024 * 1024 * 1024)).toFixed(2), // GB
        usedMemory: (usedMemory / (1024 * 1024 * 1024)).toFixed(2), // GB
        memoryUsagePercent: ((usedMemory / totalMemory) * 100).toFixed(1),
        cpuCount: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Unknown',
        uptime: process.uptime(),
        platform: os.platform(),
        hostname: os.hostname(),
        diskIOSpeeds: {
          read: Math.random() * 100, // Simulated - gerçek IO speed için ek kütüphane gerekir
          write: Math.random() * 50
        }
      }
    };

    // Sistem bilgilerini köprü sunucusuna gönder
    sendDataToCloud('/api/scada/system-info', { systemInfo });
    
    fileLogger.info('System info sent to bridge server', {
      analyzers: analyzersCount,
      alerts: alertsCount,
      collections: collections.length
    });

  } catch (error) {
    fileLogger.error('Failed to send system info to bridge', { error: (error as Error).message });
  }
};

modbusPoller.on('registerUpdated', (data) => {
    try {
        const { id, analyzerId, addr, bit, dataType, value } = data;
        const registerKey = getRegisterKey({ analyzerId, address: addr, dataType, bit });

        // Yerel WebSocket client'larına gönder (mevcut işlevsellik)
        const subscriberSocketIds = subscriptions.get(registerKey);
        if (subscriberSocketIds && subscriberSocketIds.size > 0) {
            subscriberSocketIds.forEach(socketId => {
                const socket = connections.get(socketId);
                if (socket && socket.connected) {
                    socket.emit('register-value', {
                        registerId: id,
                        analyzerId,
                        address: addr,
                        value,
                        timestamp: Date.now(),
                        dataType,
                        bit
                    });
                }
            });
        }

        // Köprü sunucusuna da gönder (yeni işlevsellik)
        if (isConnectedToBridge && cloudSocket?.connected) {
            cloudSocket.emit('register-update', {
                registerId: id,
                analyzerId,
                address: addr,
                value,
                timestamp: Date.now(),
                dataType,
                bit
            });

            fileLogger.info('Register update sent to bridge', {
                registerId: id,
                value,
                bridgeConnected: true
            });
        }

    } catch(error) {
          backendLogger.error('Error processing registerUpdated event', 'SocketIO', { error: (error as Error).message });
    }
});

expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: true }));

expressApp.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Trend Logger API routes (express-api öneki app.js'de otomatik eklenir)
expressApp.post('/start-logger', async (req: Request, res: Response) => {
  try {
    const trendLogData = req.body;
    if (!trendLogData.registerId || !trendLogData.analyzerId || !trendLogData.period || !trendLogData.interval) {
      return res.status(400).json({ error: 'registerId, analyzerId, period, and interval are required' });
    }
    const { db } = await connectToDatabase();
    const result = await db.collection('trendLogs').updateOne(
        { registerId: trendLogData.registerId },
        { $set: { ...trendLogData, status: 'running', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
    );
    res.status(200).json({ success: true, message: 'Trend logger started/updated successfully.', result });
  } catch (error) {
    backendLogger.error('Trend logger could not be started', 'TrendLoggerAPI', { error: (error as Error).message });
    res.status(500).json({ error: 'Trend logger could not be started' });
  }
});

expressApp.post('/stop-logger', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Trend logger database ID is required' });
    const { db } = await connectToDatabase();
    const result = await db.collection('trendLogs').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'stopped', stoppedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Trend logger not found' });
    res.status(200).json({ success: true, message: 'Trend logger stopped successfully.' });
  } catch (error) {
    backendLogger.error('Trend logger could not be stopped', 'TrendLoggerAPI', { error: (error as Error).message });
    res.status(500).json({ error: 'Trend logger could not be stopped' });
  }
});

expressApp.get('/get-register-value', async (req: Request, res: Response) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== 'string') return res.status(400).json({ error: 'A valid Register ID is required' });
        const lastValue = trendLoggerInstance.getLastKnownValue(id);
        if (lastValue === undefined) return res.status(404).json({ error: 'No value cached for this register ID.' });
        res.status(200).json({ success: true, value: lastValue });
    } catch (error) {
        backendLogger.error('Get register value API error', 'RegisterAPI', { error: (error as Error).message });
        res.status(500).json({ error: 'Register value could not be fetched' });
    }
});

// ==================== CLOUD BRIDGE API ====================

// POST /sync-to-cloud - Manuel cloud senkronizasyonu (express-api öneki app.js'de otomatik eklenir)
expressApp.post('/sync-to-cloud', async (req: Request, res: Response) => {
  try {
    if (!cloudSettings?.isEnabled) {
      return res.status(400).json({
        error: 'Cloud bridge is not enabled',
        success: false
      });
    }

    await syncAllDataToCloud();

    res.json({
      success: true,
      message: 'Manual sync to cloud completed',
      timestamp: new Date().toISOString(),
      cloudSettings: {
        serverIP: cloudSettings.serverIP,
        serverPort: cloudSettings.serverPort,
        connected: cloudSocket?.connected || false
      }
    });

  } catch (error) {
    backendLogger.error('Manual cloud sync error', 'CloudAPI', { error: (error as Error).message });
    res.status(500).json({
      error: 'Failed to sync to cloud',
      success: false
    });
  }
});

// GET /cloud-status - Cloud bağlantı durumunu kontrol et (express-api öneki app.js'de otomatik eklenir)
expressApp.get('/cloud-status', async (req: Request, res: Response) => {
  try {
    const { db } = await connectToDatabase();
    const settings = await db.collection('cloud_settings').findOne({ type: 'cloud_settings' });

    // Geçici basit sayımlar (gerçek verileri almak için daha karmaşık sorgu gerekebilir)
    const buildingsCount = await db.collection('buildings').countDocuments();
    const analyzersCount = await db.collection('analyzers').countDocuments();
    const widgetsCount = await db.collection('widgets').countDocuments();
    const trendLogsCount = await db.collection('trendLogs').countDocuments();

    res.json({
      success: true,
      cloudBridge: {
        enabled: settings?.isEnabled || false,
        serverIP: settings?.serverIP || null,
        serverPort: settings?.serverPort || null,
        connected: cloudSocket?.connected || false,
        lastSync: new Date().toISOString(),
        availableData: {
          buildings: buildingsCount,
          analyzers: analyzersCount,
          widgets: widgetsCount,
          trendLogs: trendLogsCount
        }
      }
    });

  } catch (error) {
    backendLogger.error('Cloud status check error', 'CloudAPI', { error: (error as Error).message });
    res.status(500).json({
      error: 'Failed to check cloud status',
      success: false
    });
  }
});

// POST /send-test-data - Test verisi gönder (express-api öneki app.js'de otomatik eklenir)
expressApp.post('/send-test-data', async (req: Request, res: Response) => {
  try {
    if (!cloudSettings?.isEnabled) {
      return res.status(400).json({
        error: 'Cloud bridge is not enabled',
        success: false
      });
    }

    const testData = {
      test: true,
      message: 'Test data from SCADA system',
      timestamp: new Date().toISOString(),
      registers: [
        {
          _id: 'test-register-1',
          name: 'Test Register 1',
          analyzerId: 'test-analyzer',
          address: 40001,
          value: Math.random() * 100,
          dataType: 'float',
          unit: '°C'
        }
      ],
      analyzers: [
        {
          _id: 'test-analyzer',
          name: 'Test Analyzer',
          slaveId: 1,
          model: 'Test Model',
          isActive: true
        }
      ]
    };

    // Test verilerini cloud'a gönder
    sendDataToCloud('/api/scada/registers', { registers: testData.registers });
    sendDataToCloud('/api/scada/analyzers', { analyzers: testData.analyzers });

    res.json({
      success: true,
      message: 'Test data sent to cloud',
      data: testData,
      cloudConnected: cloudSocket?.connected || false
    });

  } catch (error) {
    backendLogger.error('Send test data error', 'CloudAPI', { error: (error as Error).message });
    res.status(500).json({
      error: 'Failed to send test data',
      success: false
    });
  }
});

// POST /test-cloud-connection - Cloud bağlantısını test et (express-api öneki app.js'de otomatik eklenir)
expressApp.post('/test-cloud-connection', async (req: Request, res: Response) => {
  try {
    const { serverIP, serverPort } = req.body;

    if (!serverIP || !serverPort) {
      return res.status(400).json({
        error: 'Server IP and port are required',
        success: false
      });
    }

    const testSocket = require('socket.io-client')(`http://${serverIP}:${serverPort}`);

    const connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        testSocket.disconnect();
        reject(new Error('Connection timeout'));
      }, 5000);

      testSocket.on('connect', () => {
        clearTimeout(timeout);
        testSocket.disconnect();
        resolve({ success: true, message: 'Connection successful' });
      });

      testSocket.on('connect_error', (error: Error) => {
        clearTimeout(timeout);
        testSocket.disconnect();
        reject(error);
      });
    });

    const result = await connectionPromise;

    res.json({
      success: true,
      message: 'Cloud connection test successful',
      result
    });

  } catch (error) {
    backendLogger.error('Cloud connection test error', 'CloudAPI', { error: (error as Error).message });
    res.status(500).json({
      error: `Connection test failed: ${(error as Error).message}`,
      success: false
    });
  }
});

io.on('connection', (socket: Socket) => {
  connections.set(socket.id, socket);

  socket.on('watch-register', (data: any) => {
    try {
        const registerKey = getRegisterKey(data);
        if (!subscriptions.has(registerKey)) {
            subscriptions.set(registerKey, new Set<string>());
        }
        subscriptions.get(registerKey)!.add(socket.id);

        // --- ADDED: Immediately send the last known value if it exists ---
        const lastValue = trendLoggerInstance.getLastKnownValue(data.registerId);
        if (lastValue !== undefined) {
            socket.emit('register-value', {
                registerId: data.registerId,
                analyzerId: data.analyzerId,
                address: data.address,
                value: lastValue,
                timestamp: Date.now(), // Or a cached timestamp if available
                dataType: data.dataType,
                bit: data.bit
            });
        }
        // --- END ADDED ---
    } catch (error) {
      backendLogger.error('Register watch error', 'RegisterWatch', { error: (error as Error).message, stack: (error as Error).stack });
    }
  });

  socket.on('unwatch-register', (data: any) => {
    try {
        const registerKey = getRegisterKey(data);
        const subscriberSocketIds = subscriptions.get(registerKey);
        if (subscriberSocketIds) {
            subscriberSocketIds.delete(socket.id);
            if (subscriberSocketIds.size === 0) {
                subscriptions.delete(registerKey);
            }
        }
    } catch (error) {
      backendLogger.error('Register unwatch error', 'RegisterWatch', { error: (error as Error).message, stack: (error as Error).stack });
    }
  });



  socket.on('disconnect', () => {
    connections.delete(socket.id);
    subscriptions.forEach((subscribers,) => {
      if (subscribers.has(socket.id)) {
        subscribers.delete(socket.id);
      }
    });
  });
});

server.listen(Number(port), '0.0.0.0', () => {
  fileLogger.info(`Express and Socket.IO server listening on port ${port}`, "Server");

  fileLogger.info('Initializing services...', {
    source: 'Server',
    mailService: !!mailService,
    alertManager: !!alertManager,
    periodicReportService: !!periodicReportService
  });

  try {
    // Connect to Redis first
    connectRedis().then((connected) => {
      if (connected) {
        fileLogger.info("Redis client connected successfully.", "Server");
      } else {
        fileLogger.warn("Redis client connection failed, continuing without Redis caching.", "Server");
      }
    });
    modbusPoller.start().then(() => {
        fileLogger.info("Modbus Poller Orchestrator started successfully.", "Server");
    }).catch(err => {
        fileLogger.error("Modbus Poller Orchestrator failed to start", { source: 'Server', error: (err as Error).message, stack: (err as Error).stack });
    });

    trendLoggerInstance.initialize();
    fileLogger.info("TrendLoggerService initialized.", "Server");

    trendLoggerInstance.listenToPoller(modbusPoller);
    fileLogger.info("TrendLoggerService is listening to poller.", "Server");

    alertManager.listenForUpdates(modbusPoller);
    fileLogger.info("AlertManager is listening for updates.", "Server");

    // Yazma isteklerini dinlemeye başla
    setupWriteRequestListener();

    // Cloud bridge'i başlat
    initializeCloudBridge();

    // Cloud sync scheduler'ı başlat
    startCloudSync();

    // Cloud settings değişikliklerini dinle
    watchCloudSettings();

    // Sistem bilgilerini periyodik olarak gönder (her 30 saniyede bir)
    setInterval(async () => {
      if (isConnectedToBridge && cloudSettings?.isEnabled) {
        try {
          await sendSystemInfoToCloud();
        } catch (error) {
          fileLogger.error('Periodic system info sync error', { error: (error as Error).message });
        }
      }
    }, 30000); // 30 saniye

    fileLogger.info('Periodic system info sync started', { interval: '30 seconds' });

  } catch (err) {
      fileLogger.error("An error occurred during service initialization.", { source: 'Server', error: (err as Error).message, stack: (err as Error).stack });
  }
});

const setupWriteRequestListener = async () => {
    try {
        const { db } = await connectToDatabase();
        const changeStream = db.collection('write_requests').watch([
            { $match: { operationType: 'insert' } }
        ]);

        changeStream.on('change', async (change) => {
            if (change.operationType === 'insert') {
                const { registerId, value } = change.fullDocument;
                try {
                    //backendLogger.info('New write request detected from database', 'DBWatcher', { registerId, value });
                    await modbusPoller.handleWriteRequest(registerId, value);
                    // Başarılı işlemden sonra isteği silebilir veya durumunu güncelleyebiliriz.
                    await db.collection('write_requests').deleteOne({ _id: change.documentKey._id });
                } catch (error) {
                    backendLogger.error('Failed to handle write request from DB', 'DBWatcher', { error: (error as Error).message, docId: change.documentKey._id });
                    // Hatalı işlemde isteği sil
                    await db.collection('write_requests').deleteOne({ _id: change.documentKey._id });
                }
            }
        });

        changeStream.on('error', (err) => {
            backendLogger.error(`Write request change stream error: ${err.message}`, "DBWatcher");
            // Bir süre sonra yeniden bağlanmayı dene
            setTimeout(setupWriteRequestListener, 5000);
        });

        //backendLogger.info('Successfully set up write request listener on the database.', "DBWatcher");

    } catch (err) {
        backendLogger.error(`Failed to set up write request listener: ${(err as Error).message}`, "DBWatcher");
        // Bir süre sonra yeniden bağlanmayı dene
        setTimeout(setupWriteRequestListener, 5000);
    }
};


// COM portlarını temizleme fonksiyonu
const forceCloseAllComPorts = (reason: string) => {
  console.log(`${reason} - Force closing COM ports...`);
  try {
    // SerialPoller'daki tüm serial bağlantıları bul ve forceClosePort() çağır
    if ((modbusPoller as any).serialPoller && (modbusPoller as any).serialPoller.connections) {
      const connections = (modbusPoller as any).serialPoller.connections;
      let portCount = 0;
      connections.forEach((connection: any, connectionId: string) => {
        if (connection && typeof connection.forceClosePort === 'function') {
          console.log(`Force closing COM port: ${connectionId}`);
          connection.forceClosePort();
          portCount++;
        }
      });
      console.log(`${portCount} COM ports force closed.`);
    } else {
      console.log("No SerialPoller connections found.");
    }
  } catch (err) {
    console.log(`Error during COM port cleanup: ${err}`);
  }
};

// Sunucu dururken kaynakları temizlemek için - multiple event handlers
process.on('SIGTERM', async () => {
  forceCloseAllComPorts("SIGTERM received");
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  forceCloseAllComPorts("SIGINT received");
  await disconnectRedis();
  process.exit(0);
});

process.on('exit', (code) => {
  console.log(`Process exiting with code: ${code}`);
  forceCloseAllComPorts("Process exit");
  // We can't use await in exit handler, but disconnect will be attempted in SIGTERM/SIGINT
});

process.on('beforeExit', (code) => {
  console.log(`Before exit with code: ${code}`);
  forceCloseAllComPorts("Before exit");
});

// Uncaught exception durumunda akıllı hata yönetimi
process.on('uncaughtException', (err) => {
  fileLogger.error('--- UNCAUGHT EXCEPTION ---', {
      message: err.message,
      stack: err.stack
  });

  // SerialPort ile ilgili hataları daha güvenli şekilde işle
  const isSerialPortError = err.name === 'SerialPortError' ||
                           (err.message && (
                              err.message.includes('SerialPort') ||
                              err.message.includes('COM port') ||
                              err.message.includes('Port is not open') ||
                              err.message.includes('File not found') ||
                              err.message.includes('Access denied')
                           ));
  
  // Tüm portları temizle
  forceCloseAllComPorts("Uncaught exception");

  // Sadece kritik olmayan SerialPort hatalarında yaşamaya devam et
  if (isSerialPortError) {
    fileLogger.warn('SerialPort error detected. Attempting to recover without terminating service process.', {
      errorType: err.name,
      errorMessage: err.message
    });
    
    // Opsiyonel: 10 saniye sonra bir yeniden bağlantı girişimi yap
    setTimeout(() => {
      try {
        // SerialPoller varsa yeniden bağlanma döngüsünü tetikle
        if ((modbusPoller as any).serialPoller) {
          fileLogger.info('Attempting to recover SerialPort connections after uncaught exception');
          // Tüm analizörleri yeniden başlatmaya çalış
          (modbusPoller as any).serialPoller.analyzers.forEach((analyzer: any) => {
            if ((modbusPoller as any).serialPoller.startPolling) {
              (modbusPoller as any).serialPoller.startPolling(analyzer);
            }
          });
        }
      } catch (recoveryErr) {
        fileLogger.error('Failed to recover after SerialPort error', {
          error: (recoveryErr as Error).message
        });
      }
    }, 10000);
    
  } else {
    // Kritik hatalarda servisi sonlandır
    fileLogger.error('Critical uncaught exception, terminating service process', {
      errorType: err.name
    });
    process.exit(1);
  }
});

// Diğer önemli bir hata türü olan unhandledRejection'ları da yönet
process.on('unhandledRejection', (reason, promise) => {
  fileLogger.error('--- UNHANDLED REJECTION ---', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : 'No stack trace',
  });
  
  // Promise reddedilmeleri genellikle daha az kritiktir, servisi sonlandırmayız
  // Sadece loglama yapıp devam ederiz
});
