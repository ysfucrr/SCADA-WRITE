// import * as dotenv from 'dotenv';
// dotenv.config({ path: '.env.local' });
/* eslint-disable @typescript-eslint/no-explicit-any */
const dotenv = require('dotenv');
import path from 'path';
import fs from 'fs';
import { fileLogger } from './src/lib/logger/FileLogger';

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
import { alertManager } from "./src/lib/alert-manager";
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

modbusPoller.on('registerUpdated', (data) => {
    try {
        const { id, analyzerId, addr, bit, dataType, value } = data;
        const registerKey = getRegisterKey({ analyzerId, address: addr, dataType, bit });

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

// Trend Logger API routes
expressApp.post('/express-api/start-logger', async (req: Request, res: Response) => {
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

expressApp.post('/express-api/stop-logger', async (req: Request, res: Response) => {
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

expressApp.get('/express-api/get-register-value', async (req: Request, res: Response) => {
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
                    backendLogger.info('New write request detected from database', 'DBWatcher', { registerId, value });
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

// Sunucu dururken COM portlarını temizlemek için - multiple event handlers
process.on('SIGTERM', () => {
  forceCloseAllComPorts("SIGTERM received");
  process.exit(0);
});

process.on('SIGINT', () => {
  forceCloseAllComPorts("SIGINT received");
  process.exit(0);
});

process.on('exit', (code) => {
  console.log(`Process exiting with code: ${code}`);
  forceCloseAllComPorts("Process exit");
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
