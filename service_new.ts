// import * as dotenv from 'dotenv';
// dotenv.config({ path: '.env.local' });
/* eslint-disable @typescript-eslint/no-explicit-any */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
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

  socket.on('write-register', async (data: any) => {
    try {
      const { analyzerId, address, value, dataType, byteOrder, bit } = data;
      
      // Validation
      if (!analyzerId || address === undefined || value === undefined) {
        socket.emit('write-error', {
          error: 'Missing required fields: analyzerId, address, value',
          requestId: data.requestId
        });
        return;
      }

      // Value processing
      let processedValue: number;
      if (dataType === 'boolean') {
        processedValue = value === true || value === 1 || value === '1' || value === 'true' || value === 'on' ? 1 : 0;
      } else {
        processedValue = Number(value);
        if (isNaN(processedValue)) {
          socket.emit('write-error', {
            error: 'Invalid numeric value',
            requestId: data.requestId
          });
          return;
        }
      }

      backendLogger.info(`WebSocket write request: Analyzer=${analyzerId}, Address=${address}, Value=${processedValue}`, "SocketIO");

      // Write işlemi yap
      await modbusPoller.writeRegister(analyzerId, address, processedValue);
      
      // Başarı bildirimi
      socket.emit('write-success', {
        analyzerId,
        address,
        value: processedValue,
        timestamp: Date.now(),
        requestId: data.requestId
      });

      backendLogger.info(`WebSocket write successful: Analyzer=${analyzerId}, Address=${address}, Value=${processedValue}`, "SocketIO");

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Write operation failed';
      backendLogger.error(`WebSocket write error: ${errorMessage}`, "SocketIO", { data });
      
      socket.emit('write-error', {
        error: errorMessage,
        requestId: data.requestId
      });
    }
  });

  socket.on('write-multiple-registers', async (data: any) => {
    try {
      const { analyzerId, address, values } = data;
      
      // Validation
      if (!analyzerId || address === undefined || !Array.isArray(values) || values.length === 0) {
        socket.emit('write-multiple-error', {
          error: 'Missing required fields: analyzerId, address, values (array)',
          requestId: data.requestId
        });
        return;
      }

      // Values validation
      const processedValues: number[] = [];
      for (let i = 0; i < values.length; i++) {
        const val = Number(values[i]);
        if (isNaN(val)) {
          socket.emit('write-multiple-error', {
            error: `Invalid numeric value at index ${i}: ${values[i]}`,
            requestId: data.requestId
          });
          return;
        }
        processedValues.push(val);
      }

      backendLogger.info(`WebSocket write multiple request: Analyzer=${analyzerId}, Address=${address}, Values=[${processedValues.join(',')}]`, "SocketIO");

      // Write multiple işlemi yap
      await modbusPoller.writeMultipleRegisters(analyzerId, address, processedValues);
      
      // Başarı bildirimi
      socket.emit('write-multiple-success', {
        analyzerId,
        address,
        values: processedValues,
        count: processedValues.length,
        timestamp: Date.now(),
        requestId: data.requestId
      });

      backendLogger.info(`WebSocket write multiple successful: Analyzer=${analyzerId}, Address=${address}, Count=${processedValues.length}`, "SocketIO");

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Write multiple operation failed';
      backendLogger.error(`WebSocket write multiple error: ${errorMessage}`, "SocketIO", { data });
      
      socket.emit('write-multiple-error', {
        error: errorMessage,
        requestId: data.requestId
      });
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
  backendLogger.info(`Express and Socket.IO server listening on port ${port}`, "Server");

  backendLogger.info('Initializing services...', 'Server', {
    mailService: !!mailService,
    alertManager: !!alertManager,
    periodicReportService: !!periodicReportService
  });

  modbusPoller.start().catch(err => {
      backendLogger.error("Modbus Poller Orchestrator failed to start", "Server", { error: (err as Error).message, stack: (err as Error).stack });
  });

  trendLoggerInstance.initialize();
  trendLoggerInstance.listenToPoller(modbusPoller);
  alertManager.listenForUpdates(modbusPoller);
});

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

// Uncaught exception durumunda da temizle
process.on('uncaughtException', (err) => {
  console.log(`Uncaught exception: ${err.message}`);
  forceCloseAllComPorts("Uncaught exception");
  process.exit(1);
});
