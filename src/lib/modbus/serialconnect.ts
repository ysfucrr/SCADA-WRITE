// Global initialization - will run before any module imports
(function initializeModuleResolver() {
  try {
    // Sadece kritik hataları logla, diğer detayları kaldır
    // Check if running in packaged mode
    // TypeScript-safe check for Electron resourcesPath property
    const hasResourcesPath = (() => {
      try {
        return typeof (process as any).resourcesPath !== 'undefined';
      } catch (e) {
        return false;
      }
    })();
    
    const isPackaged = process.env.IS_PACKAGED === 'true' ||
                      process.env.NODE_ENV === 'production' ||
                      hasResourcesPath;
    
    if (isPackaged) {
      const fs = require('fs');
      const path = require('path');
      
      // Get resource path - TypeScript-safe
      const resourcePath = hasResourcesPath ? (process as any).resourcesPath || '' : '';
      
      // Define possible module paths in priority order
      const possiblePaths = [
        path.join(resourcePath, 'app', 'dist-service', 'serial'),
        path.join(resourcePath, 'app.asar.unpacked', 'node_modules'),
        path.join(resourcePath, 'app', 'dist-service', 'node_modules'),
        path.join(resourcePath, 'app', 'node_modules'),
        path.join(resourcePath, 'app.asar', 'node_modules'),
        path.join(process.cwd(), 'node_modules'),
      ];
      
      // Filter valid paths
      const validPaths = possiblePaths.filter(p => {
        try {
          return fs.existsSync(p);
        } catch (err: unknown) {
          return false;
        }
      });
      
      // Add all valid paths to module.paths
      for (const validPath of validPaths) {
        module.paths.unshift(validPath);
      }
      
      // Enhanced require function for critical modules
      try {
        const originalRequire = module.constructor.prototype.require;
        const criticalModules = ['serialport', '@serialport', 'modbus-serial'];
        
        module.constructor.prototype.require = function(moduleName: string) {
          try {
            // First try normal require
            return originalRequire.call(this, moduleName);
          } catch (err) {
            // If this is a critical module, try custom paths
            if (criticalModules.some(m => moduleName === m || moduleName.startsWith(`${m}/`))) {
              // Try all valid paths
              for (const validPath of validPaths) {
                try {
                  const fullPath = path.join(validPath, moduleName);
                  const result = originalRequire.call(this, fullPath);
                  return result;
                } catch (pathErr: unknown) {
                  // Sadece devam et, bir sonraki yolu dene
                }
              }
              
              // Try direct index.js loading
              if (moduleName === 'serialport') {
                for (const validPath of validPaths) {
                  try {
                    const indexPath = path.join(validPath, moduleName, 'index.js');
                    if (fs.existsSync(indexPath)) {
                      const SerialPortModule = originalRequire.call(this, indexPath);
                      return SerialPortModule;
                    }
                  } catch (indexErr: unknown) {
                    // Sadece devam et, bir sonraki yolu dene
                  }
                }
              }
            }
            
            // If all attempts failed, throw the original error
            throw err;
          }
        };
      } catch (monkeyPatchErr: unknown) {
        console.error(`MODULE RESOLVER ERROR: Failed to monkey patch require: ${monkeyPatchErr instanceof Error ? monkeyPatchErr.message : String(monkeyPatchErr)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`MODULE RESOLVER ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
})();

// Now import other modules
import PQueue from "p-queue";
import { backendLogger } from "../logger/BackendLogger";
// Not: Bu dosyada gereksiz debug logları kaldırıldı, sadece kritik hata ve uyarı logları bırakıldı
import { ModbusConnection } from "./ModbusConnection";
import path from "path";
import * as fs from 'fs';

// Define extended ModbusRTU type with _driver property
interface ExtendedModbusRTU {
  _port?: any;
  _driver?: any;
  _onReceive?: (data: Buffer) => void;
  _onError?: (err: Error) => void;
  _events?: any;
  _eventsCount?: number;
  _maxListeners?: number;
  _transactions?: any;
  _timeout?: number;
  _unitID?: number;
  _debugEnabled?: boolean;
  connectRTUBuffered(path: string, options: any): Promise<void>;
  setTimeout(timeout: number): void;
  setID(id: number): void;
  readHoldingRegisters(address: number, quantity: number): Promise<any>;
  close(callback: () => void): void;
}

// Load critical modules dynamically
let ModbusRTU: any; // Cannot use typeof with interface, use any instead
let SerialPortConstructor: any = null;

// Load ModbusRTU
try {
  ModbusRTU = require('modbus-serial');
  // ModbusRTU detaylı inceleme logları kaldırıldı
} catch (err) {
  backendLogger.error(`Failed to load ModbusRTU: ${(err as Error).message}`, "ModuleLoader");
  throw new Error(`ModbusRTU load error: ${(err as Error).message}`);
}

// Load SerialPort
try {
  // SerialPort v13'de import yöntemi değişti
  try {
    // Önce yeni import yapısını dene
    const serialportModule = require('serialport');
    // Gereksiz detaylı modül logları kaldırıldı
    
    if (serialportModule && typeof serialportModule.SerialPort === 'function') {
      SerialPortConstructor = serialportModule.SerialPort;
      // SerialPort constructor detaylı logları kaldırıldı
    } else if (typeof serialportModule === 'function') {
      SerialPortConstructor = serialportModule;
      // SerialPort constructor detaylı logları kaldırıldı
    } else {
      // Fallback - try direct import
      const { SerialPort } = require('serialport');
      if (typeof SerialPort === 'function') {
        SerialPortConstructor = SerialPort;
        // SerialPort constructor detaylı logları kaldırıldı
      } else {
        throw new Error('SerialPort constructor not found in any import format');
      }
    }
  } catch (importErr) {
    backendLogger.warning(`Modern import failed: ${(importErr as Error).message}, trying legacy import`, "ModuleLoader");
    
    // Fallback to legacy
    try {
      const SerialPortLegacy = require('serialport');
      if (typeof SerialPortLegacy === 'function') {
        SerialPortConstructor = SerialPortLegacy;
      } else {
        throw new Error('Legacy SerialPort import succeeded but no constructor found');
      }
    } catch (legacyErr) {
      throw new Error(`All SerialPort import methods failed: ${(legacyErr as Error).message}`);
    }
  }
  
  // SerialPort başarıyla yüklendi
} catch (err) {
  backendLogger.error(`Failed to load SerialPort: ${(err as Error).message}`, "ModuleLoader");
}

// Connection options interface
interface ConnectionOptions {
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    port?: number;
}

/**
 * Seri port bağlantıları için tek kuyruk sistemi
 * Bu sayede aynı COM port için birden fazla kuyruk oluşması engellenir
 */
// Statik kuyruk havuzu - her port için tek bir kuyruk
const serialQueuePool: Map<string, PQueue> = new Map();
// Kuyruk kullanım sayacı - her kuyruk için kaç bağlantı kullanıyor
const queueUsageCounter: Map<string, number> = new Map();
// Kuyruk sağlık izleme - son timeout zamanı
const queueLastTimeout: Map<string, number> = new Map();
// Port açma işlemi için lock mekanizması
const portOpenLocks: Map<string, boolean> = new Map();
// Port açma işlemi için bekleyen işlemler
const portOpenQueue: Map<string, Array<() => void>> = new Map();

/**
 * ModbusSerialConnection class - Manages serial port connection
 */
export class ModbusSerialConnection extends ModbusConnection {
    portName: string;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
    // Kuyruk kimliği - port adı ve baudrate birleşimi
    private queueId: string;

    constructor(portName: string, options: ConnectionOptions = {}) {
        super(portName);
        this.portName = portName;
        this.baudRate = options.baudRate || 9600;
        this.dataBits = options.dataBits || 8;
        this.stopBits = options.stopBits || 1;
        this.parity = options.parity || 'none';
        
        // Kuyruk kimliğini oluştur: "COM3@9600" formatında
        this.queueId = `${this.portName}@${this.baudRate}`;
        
        // Set concurrency to 1 for serial connections
        this.concurrency = 1;
    }

    /**
     * Seri bağlantı için kuyruk oluşturur veya varolan kuyruğu kullanır
     * Aynı porta ait tüm bağlantılar tek bir kuyruğu paylaşır
     */
    protected createOwnQueue(): PQueue {
        // Kuyruk kullanım sayacını artır
        const currentCount = queueUsageCounter.get(this.queueId) || 0;
        queueUsageCounter.set(this.queueId, currentCount + 1);
        
        // Kuyruk sağlık kontrolü - son 10 saniye içinde timeout olduysa resetle
        const lastTimeoutTime = queueLastTimeout.get(this.queueId) || 0;
        const now = Date.now();
        const shouldResetQueue = lastTimeoutTime > 0 && (now - lastTimeoutTime < 10000);
        
        // Eğer kuyruk resetlenmesi gerekiyorsa veya kuyruk yoksa
        if (shouldResetQueue && serialQueuePool.has(this.queueId)) {
            backendLogger.warning(`Queue for ${this.queueId} had recent timeout, resetting it`, "SerialConnection");
            const oldQueue = serialQueuePool.get(this.queueId);
            if (oldQueue) {
                try {
                    oldQueue.clear();
                    oldQueue.pause();
                } catch (err) {
                    // Ignore cleanup errors
                }
            }
            serialQueuePool.delete(this.queueId);
            queueLastTimeout.delete(this.queueId);
        }
        
        // Önce statik havuzda bu port için kuyruk var mı kontrol et
        if (serialQueuePool.has(this.queueId)) {
            backendLogger.info(`Reusing existing queue for ${this.queueId} (users: ${currentCount + 1})`, "SerialConnection");
            const existingQueue = serialQueuePool.get(this.queueId)!;
            return existingQueue;
        }
        
        // Yoksa yeni kuyruk oluştur
        const concurrency = 1; // Seri portlar için her zaman 1
        
        const queue = new PQueue({
            concurrency: concurrency,
            autoStart: true,
            throwOnTimeout: true,
            carryoverConcurrencyCount: true
        });
        
        // Timeout izleme
        queue.on('error', (err) => {
            if (err && err.message && (err.message.includes('timed out') || err.name === 'TimeoutError')) {
                queueLastTimeout.set(this.queueId, Date.now());
                backendLogger.warning(`Queue timeout detected for ${this.queueId}, marked for potential reset`, "SerialConnection");
            }
        });
        
        // Kuyruğu havuza ekle
        serialQueuePool.set(this.queueId, queue);
        backendLogger.info(`Created new queue for ${this.queueId}`, "SerialConnection");
        
        return queue;
    }

    /**
     * Calculate smart timeout - UI value + RTT-based minimum protection
     */
    calculateSmartTimeout(userTimeout: number): number {
        const cappedRTT = Math.min(this.avgRTT, 2000);
        
        let multiplier = 3;
        if (cappedRTT > 800) {
            multiplier = 4;
        } else if (cappedRTT > 400) {
            multiplier = 3.5;
        }
        
        const rttMinimum = Math.max(1000, cappedRTT * multiplier);
        const smartTimeout = Math.max(userTimeout, rttMinimum);
        const finalTimeout = Math.min(smartTimeout, 15000);
        
        return finalTimeout;
    }

    /**
     * Updates RTT value
     */
    updateRTT(elapsed: number): void {
        this.rttSamples.push(elapsed);
        
        if (this.rttSamples.length > this.rttSampleSize) {
            this.rttSamples.shift();
        }
        
        if (this.rttSamples.length >= 3) {
            const sortedSamples = [...this.rttSamples].sort((a, b) => a - b);
            const q1Index = Math.floor(sortedSamples.length * 0.25);
            const q3Index = Math.floor(sortedSamples.length * 0.75);
            const validSamples = sortedSamples.filter(
                sample => sample >= sortedSamples[q1Index] && sample <= sortedSamples[q3Index]
            );
            
            if (validSamples.length > 0) {
                this.avgRTT = validSamples.reduce((sum, val) => sum + val, 0) / validSamples.length;
            }
        } else if (this.rttSamples.length > 0) {
            this.avgRTT = this.rttSamples.reduce((sum, val) => sum + val, 0) / this.rttSamples.length;
        }
        
        this.updateConcurrency();
    }

    /**
     * Handles read errors
     */
    handleReadError(err: any): void {
        super.handleReadError(err);
        // Simple error handling - no timeout strike mechanism
    }

    /**
     * Reads holding registers via Modbus - optimized for Serial
     */
    async readHoldingRegisters(slaveId: number, startAddr: number, quantity: number, timeoutMs: number): Promise<number[]> {
        
        if (!this.client || !this.isConnected) {
            backendLogger.error(`[SERIAL] Connection not established: client=${!!this.client}, isConnected=${this.isConnected}`, "SerialConnection");
            throw new Error("Connection is not established");
        }

        if (!this.queue) {
            backendLogger.error(`[SERIAL] Queue not initialized`, "SerialConnection");
            throw new Error("Queue is not initialized");
        }

        const startTime = Date.now();
        
        if (timeoutMs > 100) {
            this.pollMs = timeoutMs;
        }

        try {
            const result = await this.queue.add(
                async () => {
                    if (!this.client || !this.isConnected) {
                        throw new Error("Connection lost");
                    }

                    // Fully compatible with reference code - simple and clean
                    this.client.setID(Math.max(1, Math.min(255, slaveId)));
                    
                    // Smart timeout - UI value + RTT-based protection
                    const smartTimeout = this.calculateSmartTimeout(timeoutMs);
                    this.client.setTimeout(smartTimeout);

                    return this.client.readHoldingRegisters(startAddr, quantity);
                },
                {
                    priority: Math.max(1, 10 - Math.min(9, Math.floor(startAddr / 1000))),
                    timeout: this.calculateSmartTimeout(timeoutMs) + 500
                }
            );

            const elapsed = Date.now() - startTime;
            this.updateRTT(elapsed);

            // Successful read, reset timeout counter
            this.timeoutStrikes = 0;

            if (result && 'data' in result) {
                return result.data;
            }
            throw new Error("Invalid response from Modbus device");
        } catch (err: unknown) {
            const elapsed = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);
            // Kısıtlamayı kaldır: Her türlü okuma hatasını detaylarıyla logla.
            backendLogger.warning(`Read error on ${this.connectionId} (Slave: ${slaveId}, Address: ${startAddr}x${quantity}): ${errorMessage} (took ${elapsed}ms)`, "SerialConnection");
            
            this.handleReadError(err);
            throw err;
        }
    }
    
    /**
     * Force concurrency value to 1 for Serial ports
     */
    updateConcurrency(_forceUpdate: boolean = false): number {
        // Serial ports are inherently sequential. Concurrency should always be 1.
        if (this.queue && this.queue.concurrency !== 1) {
             this.queue.concurrency = 1;
        }
        this.concurrency = 1;
        return 1;
    }
    
    /**
     * Port açma lock mekanizması - aynı COM port için senkronizasyon sağlar
     */
    private async acquirePortLock(portName: string): Promise<void> {
        return new Promise((resolve) => {
            if (!portOpenLocks.has(portName) || portOpenLocks.get(portName) === false) {
                portOpenLocks.set(portName, true);
                resolve();
            } else {
                // Eğer bu port için queue yoksa oluştur
                if (!portOpenQueue.has(portName)) {
                    portOpenQueue.set(portName, []);
                }
                // Çözümleme fonksiyonunu kuyruğa ekle
                portOpenQueue.get(portName)!.push(resolve);
            }
        });
    }

    /**
     * Port açma lock mekanizmasını serbest bırak
     */
    private releasePortLock(portName: string): void {
        // Eğer bekleyen işlem varsa, ilk bekleyeni serbest bırak
        if (portOpenQueue.has(portName) && portOpenQueue.get(portName)!.length > 0) {
            const nextResolve = portOpenQueue.get(portName)!.shift();
            if (nextResolve) {
                nextResolve();
            }
        } else {
            // Bekleyen işlem yoksa lock'u kaldır
            portOpenLocks.set(portName, false);
        }
    }

    /**
     * Establishes a serial port connection
     */
    async connect(): Promise<void> {
        if (this.isConnected && this.client) {
            return;
        }
    
        // Port açma lock'unu al - aynı COM port için çakışmaları önle
        await this.acquirePortLock(this.portName);

        try {
            // Önce bu port hala açık mı kontrol et (başka bir instance tarafından)
            const existingConnections = Array.from(serialQueuePool.keys())
                .filter(qid => qid.startsWith(this.portName + '@'));

            if (existingConnections.length > 0) {
                backendLogger.info(`Port ${this.portName} may be in use by other connections. Ensuring clean state before reconnect.`, "SerialConnection");
            }

            // Clean up old handles when USB is reconnected
            if (this.client) {
                backendLogger.info(`Aggressively closing port ${this.portName} before reconnect`, "SerialConnection");
                
                // Port bağlantısını tamamen temizleyelim
                this.forceClosePort();
                
                // Windows'ta port handle'ını tam serbest bırakmak için daha uzun bekle
                // USB cihaz takma-çıkarma sonrasında daha uzun bekleme (2→5 saniye)
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Kuyruk havuzunu temizle - temiz başlangıç için
                if (serialQueuePool.has(this.queueId)) {
                    serialQueuePool.delete(this.queueId);
                    backendLogger.info(`Removed queue for ${this.queueId} before reconnect for clean start`, "SerialConnection");
                }
            }
            
            // Add longer wait to prevent port handle conflicts when server restarts
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Retry mechanism for "Unknown error code 31" (SetCommState) error
            let connectionAttempts = 0;
            const maxAttempts = 3;
            let lastError: any = null;
            
            while (connectionAttempts < maxAttempts) {
                try {
                    connectionAttempts++;
                    
                    // SerialPortConstructor null kontrolü
                    if (SerialPortConstructor === null) {
                        throw new Error("SerialPort constructor is null - module not loaded properly");
                    }
                    
                    // Tanılama logları kaldırıldı
                    
                    // Pass SerialPort constructor directly to ModbusRTU
                    this.client = new ModbusRTU();
                    
                    // KRITIK FIX: ModbusRTU'nun metodlarını override et
                    // Bu, obfuscation'dan etkilenmeyen bir implementasyon sağlar
                    if (this.client) {
                        // Reference'ı saklayalım, böylece lambda içinde null hatası olmaz
                        const modbusClient = this.client as any; // any kullanarak TypeScript hatalarını bypass et
                        const originalConnectRTUBuffered = modbusClient.connectRTUBuffered;
                        
                        // ModbusRTU _onError metodunu override et - uncaught exception önlemek için kritik
                        if (typeof modbusClient._onError === 'function') {
                            const originalOnError = modbusClient._onError;
                            modbusClient._onError = (err: any) => {
                                try {
                                    backendLogger.error(`ModbusRTU error safely handled: ${err.message}`, "SerialConnection", {
                                        connectionId: this.connectionId,
                                        portName: this.portName,
                                        errorName: err.name || 'Unknown',
                                        errno: err.errno || 'None'
                                    });
                                    
                                    // COM port hatası durumunda bağlantıyı kaybetmiş olarak işaretle
                                    if (err.message && (
                                        err.message.includes('Port is not open') ||
                                        err.message.includes('Port Not Open') ||
                                        err.message.includes('File not found') ||
                                        err.message.includes('Access denied') ||
                                        err.message.includes('Resource busy')
                                    )) {
                                        backendLogger.warning(`Port error detected, marking connection as lost: ${err.message}`, "SerialConnection");
                                        this.handleConnectionLoss();
                                    }
                                    
                                    // Hata bunu çağıran metoda iletilsin, ama global scope'a fırlatılmasın
                                    // Bu sayede fonksiyonlar kendi içlerinde hataları yakalayabilir
                                    
                                } catch (handlerErr) {
                                    backendLogger.error(`Error in safe _onError handler: ${(handlerErr as Error).message}`, "SerialConnection");
                                    // Orijinal metodu çağırma, çünkü bu unhandled exception'a neden olabilir
                                }
                            };
                            // Override edildi
                        }
                        
                        // connectRTUBuffered metodunu güvenli bir versiyonla değiştir
                        modbusClient.connectRTUBuffered = async (portPath: string, options: any = {}) => {
                            try {
                                // Bağlantı oluşturma
                                
                                // SerialPort constructor'ının ilk parametresi için farklı yaklaşımlar deneyelim
                                let port;
                                try {
                                    const portOptions = {
                                        path: portPath,
                                        baudRate: options.baudRate || 9600,
                                        dataBits: options.dataBits || 8,
                                        stopBits: options.stopBits || 1,
                                        parity: options.parity || 'none',
                                        autoOpen: false
                                    };
                                    
                                    // SerialPort oluştur
                                    port = new SerialPortConstructor(portOptions);
                                } catch (portError: any) {
                                    backendLogger.warning(`Failed with options object: ${portError.message}`, "SerialConnection");
                                    
                                    // Alternatif olarak doğrudan path parametresi deneyelim
                                    try {
                                        // Alternatif yöntem
                                        port = new SerialPortConstructor(portPath, {
                                            baudRate: options.baudRate || 9600,
                                            dataBits: options.dataBits || 8,
                                            stopBits: options.stopBits || 1,
                                            parity: options.parity || 'none',
                                            autoOpen: false
                                        });
                                    } catch (directPathError: any) {
                                        backendLogger.warning(`Failed with direct path parameter: ${directPathError.message}`, "SerialConnection");
                                        throw new Error(`Cannot create SerialPort with any known approach: ${directPathError.message}`);
                                    }
                                }
                                
                                // _port özelliğini doğrudan atayarak ModbusRTU'nun içindeki SerialPort kullanımını bypass et
                                modbusClient._port = port;
                                
                                // Gerekli event listener'ları ekle - modbusClient'ı any olarak kullanıyoruz
                                port.on('data', (data: Buffer) => {
                                    if (modbusClient && typeof modbusClient._onReceive === 'function') {
                                        modbusClient._onReceive(data);
                                    }
                                });
                                
                                port.on('error', (err: Error) => {
                                    try {
                                        backendLogger.error(`SerialPort error: ${err.message}`, "SerialConnection", { portPath });
                                        
                                        if (modbusClient && typeof modbusClient._onError === 'function') {
                                            modbusClient._onError(err); // Artık güvenli _onError çağrılıyor
                                        }
                                    } catch (handlerErr) {
                                        // Port error handler'daki hatalar asla dışarı sızmamalı
                                        backendLogger.error(`Exception in port.on('error') handler: ${(handlerErr as Error).message}`, "SerialConnection");
                                    }
                                });
                                
                                // SerialPort v13'te open methodu callback kabul etmez, promise döndürür
                                // Port aç - Access Denied hatası için yeniden deneme mekanizması ekle
                                try {
                                    // Önce normal açmayı dene
                                    await port.open();
                                    return Promise.resolve();
                                } catch (openErr: any) {
                                    // Eğer "Access Denied" hatası alındıysa, biraz bekleyip yeniden dene
                                    if (openErr.message && openErr.message.includes('Access denied')) {
                                        backendLogger.warning(`Access denied for port ${portPath}, waiting 3 seconds before retry`, "SerialConnection");
                                        
                                        // Access Denied hatası alındığında GC'yi zorla ve bekle
                                        if (typeof global !== 'undefined' && (global as any).gc) {
                                            try {
                                                (global as any).gc();
                                            } catch (gcErr) {
                                                // Ignore GC errors
                                            }
                                        }
                                        
                                        // Daha uzun bekle ve tekrar dene
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        
                                        try {
                                            // Yeniden dene
                                            await port.open();
                                            backendLogger.info(`Successfully opened port ${portPath} after Access Denied retry`, "SerialConnection");
                                            return Promise.resolve();
                                        } catch (retryErr: any) {
                                            backendLogger.error(`Still failed to open port ${portPath} after retry: ${retryErr.message}`, "SerialConnection");
                                            throw retryErr;
                                        }
                                    } else {
                                        backendLogger.error(`Error opening port ${portPath}: ${openErr.message}`, "SerialConnection");
                                        throw openErr;
                                    }
                                }
                            } catch (err: unknown) {
                                const errorMsg = err instanceof Error ? err.message : String(err);
                                backendLogger.error(`Protected connectRTUBuffered failed: ${errorMsg}`, "SerialConnection");
                                throw err;
                            }
                        };
                        
                    }
                    
                    if (this.client) {
                        try {
                            if (!(this.client as any)._driver) {
                                // _driver'a atama yap
                                (this.client as any)._driver = SerialPortConstructor;
                                
                                // Kritik uyarı
                                if (typeof (this.client as any)._driver !== 'function') {
                                    backendLogger.warning(`WARNING: ModbusRTU _driver is NOT a function after setting!`, "SerialConnection");
                                }
                            }
                        } catch (driverErr) {
                            backendLogger.error(`Failed to set SerialPort driver: ${(driverErr as Error).message}`, "SerialConnection");
                        }
                    }
                    
                    // Verify ModbusRTU was loaded correctly
                    if (!this.client || typeof this.client.connectRTUBuffered !== 'function') {
                        backendLogger.error(`ModbusRTU correctly instantiated but missing connectRTUBuffered: ${JSON.stringify(Object.keys(this.client || {}))}`, "SerialConnection");
                        throw new Error("ModbusRTU instantiated but connectRTUBuffered not found");
                    }
                    
                    // connectRTUBuffered metodunu çağırmadan önce ek kontrol
                    if (!this.client.connectRTUBuffered) {
                        backendLogger.error(`connectRTUBuffered method is missing on ModbusRTU instance`, "SerialConnection");
                        throw new Error("ModbusRTU instance doesn't have connectRTUBuffered method");
                    }
                    
                    // Bağlantı kurulumu
                    
                    try {
                        await this.client.connectRTUBuffered(this.portName, {
                            baudRate: this.baudRate,
                            dataBits: this.dataBits,
                            stopBits: this.stopBits,
                            parity: this.parity,
                        });
                        // Bağlantı başarılı
                    } catch (connectBufferedErr: unknown) {
                        const errorMsg = connectBufferedErr instanceof Error ? connectBufferedErr.message : String(connectBufferedErr);
                        backendLogger.error(`Error in connectRTUBuffered: ${errorMsg}`, "SerialConnection");
                        
                        // Özellikle SerialPort constructor hatasını inceleyelim
                        if (errorMsg.includes('not a constructor')) {
                            backendLogger.error(`CRITICAL: SerialPort constructor error detected!`, "SerialConnection");
                            
                            // Acil çözüm dene
                            try {
                                // Access denied hatası için bilinen çözümler:
                                // 1. SerialPort construction yöntemini değiştir
                                try {
                                    if (typeof SerialPortConstructor === 'function') {
                                        backendLogger.info(`Trying different constructor approach for ${this.portName}`, "SerialConnection");
                                        (this.client as any)._driver = SerialPortConstructor;
                                    }
                                } catch (err) {
                                    // Ignore errors
                                }
                            } catch (fixErr: unknown) {
                                backendLogger.error(`Failed emergency fix: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`, "SerialConnection");
                            }
                        }
                        
                        // Hatayı yukarı fırlat
                        throw connectBufferedErr;
                    }
                    
                    break; // Successful connection, exit loop
                    
                } catch (connectErr: any) {
                    lastError = connectErr;
                    const errorMsg = connectErr.message || String(connectErr);
                    
                    // Special handling for Windows port errors
                    if (errorMsg.includes('Unknown error code 31') ||
                        errorMsg.includes('SetCommState') ||
                        errorMsg.includes('Access denied')) {
                        backendLogger.warning(`[SERIAL] SetCommState error on attempt ${connectionAttempts}/${maxAttempts} for ${this.portName}: ${errorMsg}`, "SerialConnection");
                        
                        // Clean up client
                        if (this.client) {
                            try {
                                if (typeof this.client.close === 'function') {
                                    this.client.close(() => {});
                                }
                            } catch (cleanupErr) {
                                // Ignore cleanup errors
                            }
                            this.client = null;
                        }
                        
                        // Wait if not the last attempt
                        if (connectionAttempts < maxAttempts) {
                            const waitTime = connectionAttempts * 1000; // 1s, 2s, 3s
                            // Bekleme detay logu kaldırıldı
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }
                    } else {
                        // For other errors, exit immediately
                        throw connectErr;
                    }
                }
            }
            
            // Throw last error if all attempts failed
            if (connectionAttempts >= maxAttempts && lastError) {
                throw lastError;
            }
    
            if (this.client && this.client._port) {
                this.safeAddListener('error', (...args: unknown[]) => {
                    const err = args[0] as Error;
                    backendLogger.error(`${this.connectionId} error: ${err.message}`, "SerialConnection");
                    this.handleConnectionLoss();
                });

                this.safeAddListener('close', () => {
                    backendLogger.warning(`${this.connectionId} closed`, "SerialConnection");
                    this.handleConnectionLoss();
                });
            }
    
            // Statik kuyruk havuzundan kuyruk al veya oluştur
            this.queue = this.createOwnQueue();
            
            // Eşzamanlılık değerini mutlaka 1 olarak ayarla
            this.concurrency = 1;
            this.queue.concurrency = 1;
            
            this.setupQueueEvents();
    
            this.isConnected = true;
            this.retryCount = 0;
            this.emit('connected');
        } catch (err: unknown) {
            this.retryCount++;
            // Bağlantı hatası - kritik log korundu
            const errorMessage = err instanceof Error ? err.message : String(err);
            backendLogger.error(`Connection failed for ${this.connectionId}: ${errorMessage}`, "SerialConnection");
    
            this.emit('connectionLost');
            throw err;
        } finally {
            // Her durumda port lock'unu serbest bırak
            this.releasePortLock(this.portName);
        }
    }

    /**
     * Sets up queue event listeners
     */
    setupQueueEvents(): void {
        if (!this.queue) {
            return;
        }
        
        this.queue.on("idle", () => {
            setTimeout(() => {
                if (this.queue && this.queue.size === 0 && this.queue.pending === 0) {
                    this.queue.clear();
                }
            }, 1000);
        });

        this.queue.on("error", (err: Error) => {
            backendLogger.error(`${this.connectionId} queue error: ${err.message}`, "ModbusConnection");
        });
    }

    /**
     * Handles connection loss - SerialPoller makes reconnect decision
     */
    protected handleConnectionLoss(): void {
        if (this.isShuttingDown) {
            return;
        }
        if (!this.isConnected || this.connectionLostEmitted) return;

        this.isConnected = false;
        this.connectionLostEmitted = true; // Set flag
        
        // Aggressive port cleanup when USB is disconnected
        this.forceClosePort();
        this.emit('connectionLost');
    }

    /**
     * Aggressively cleans up port handle when USB is disconnected
     */
    /**
     * Windows COM portları için özel çözüm
     * COM port erişim engellerini çözmek için ekstra önlemler alır
     *
     * @returns true if successful
     */
    private releaseWindowsComPort(): boolean {
        try {
            // Windows COM portları için özel temizlik işlemleri
            backendLogger.info(`Special Windows COM port release process for ${this.portName}`, "SerialConnection");
            
            // Statik kuyruk havuzunda bu porta ait kuyruğu temizleyelim
            const queueId = `${this.portName}@${this.baudRate}`;
            if (serialQueuePool.has(queueId)) {
                const queue = serialQueuePool.get(queueId);
                if (queue) {
                    queue.clear();
                    queue.pause();
                    backendLogger.info(`Cleared and paused queue for ${queueId} to help release port`, "SerialConnection");
                }
                
                // Kuyruk havuzundan geçici olarak kaldır (yeni bağlantı denemesinde yeniden oluşturulacak)
                serialQueuePool.delete(queueId);
                queueUsageCounter.delete(queueId);
                queueLastTimeout.delete(queueId);
                backendLogger.info(`Temporarily removed queue for ${queueId} from pool to help release port`, "SerialConnection");
            }
            
            // Bu port için lock mekanizmasını temizle
            if (portOpenLocks.has(this.portName)) {
                portOpenLocks.delete(this.portName);
            }
            if (portOpenQueue.has(this.portName)) {
                portOpenQueue.delete(this.portName);
            }
            
            // Ek bellek temizliği
            if (typeof global !== 'undefined' && (global as any).gc) {
                try {
                    (global as any).gc();
                    backendLogger.info(`Forced garbage collection to help release port ${this.portName}`, "SerialConnection");
                } catch (gcErr) {
                    // Ignore GC errors
                }
            }
            return true;
        } catch (err) {
            // Ignore errors during special release
            return false;
        }
    }

    public forceClosePort(): void {
        try {
            if (this.client && this.client._port) {
                const port = this.client._port as any;
                
                // Önce kuyruktaki tüm işlemleri iptal et
                if (this.queue) {
                    this.queue.clear();
                    backendLogger.info(`Cleared queue for ${this.connectionId} during force close`, "SerialConnection");
                }
                
                // Force port status to closed
                if (port.isOpen !== undefined) {
                    try {
                        // isOpen property might be read-only in Windows, change descriptor
                        Object.defineProperty(port, 'isOpen', {
                            value: false,
                            writable: true,
                            configurable: true
                        });
                    } catch (propErr) {
                        // If property definition fails, try to change internal state
                        if (port._isOpen !== undefined) port._isOpen = false;
                        if (port.opened !== undefined) port.opened = false;
                    }
                }
                
                // Mark port as destroyed
                if (port.destroyed !== undefined) {
                    try {
                        Object.defineProperty(port, 'destroyed', {
                            value: true,
                            writable: true,
                            configurable: true
                        });
                    } catch (propErr) {
                        if (port._destroyed !== undefined) port._destroyed = true;
                    }
                }
                
                // Clean up all listeners
                if (typeof port.removeAllListeners === 'function') {
                    port.removeAllListeners();
                }
                
                // Force close port synchronously
                if (typeof port.close === 'function') {
                    try {
                        // Try synchronous close without callback
                        if (port.close.length === 0) {
                            port.close();
                        } else {
                            // Async close with callback
                            port.close(() => {});
                        }
                    } catch (closeErr) {
                        // Ignore close errors during force close
                    }
                }
                
                // Force destroy port
                if (typeof port.destroy === 'function') {
                    try {
                        port.destroy();
                    } catch (destroyErr) {
                        // Ignore destroy errors during force close
                    }
                }
                
                // Clean up file descriptor (for Windows)
                if (port.fd !== undefined) {
                    try {
                        port.fd = null;
                        backendLogger.info(`Nullified file descriptor for ${this.connectionId}`, "SerialConnection");
                    } catch (fdErr) {
                        // Ignore fd errors
                    }
                }
                
                // Clean up port handle (for Windows)
                if (port.handle !== undefined) {
                    try {
                        port.handle = null;
                    } catch (handleErr) {
                        // Ignore handle errors
                    }
                }
                
                // Clear port reference
                this.client._port = undefined;
            }
            
            // Clean up client reference
            this.client = null;
            this.portListeners.clear();
            
            // Reset connection state
            this.isConnected = false;
            this.connectionLostEmitted = false;
            
        } catch (err) {
            // Ignore errors during force port close
        } finally {
            // Windows COM port için özel serbest bırakma işlemi
            const released = this.releaseWindowsComPort();
            if (released) {
                backendLogger.info(`Successfully released Windows COM port ${this.portName}`, "SerialConnection");
            }
        }
    }

    /**
     * Attempt reconnect method like TCP - called by PollingEngine
     */
    public async attemptReconnect(): Promise<void> {
        if (this.isShuttingDown || this.isConnected) {
            return;
        }

        // Reset this flag before attempting reconnection
        this.connectionLostEmitted = false;
        
        try {
            await this.connect();
        } catch {
            // Error is already handled in connect and connectionLost is emitted
        }
    }

    /**
     * Schedule reconnect - from REFERENCE code
     * Now only called by SerialPoller with register check
     */
    public scheduleReconnect(delay = 30000): void {
        if ((this as any).reconnectTimer || this.isShuttingDown) return;
    
        (this as any).reconnectTimer = setTimeout(async () => {
            (this as any).reconnectTimer = null;
    
            try {
                await this.connect();
                this.emit('reconnected');
            } catch {
                // Error is already handled in connect
            }
        }, delay);
    }
    
    /**
     * Close serial port connection - includes advanced port cleanup
     */
    override close(): void {
        if (!this.isConnected && !this.client) {
            return;
        }
        
        this.isConnected = false;
        
        // Kuyruğu temizle, ancak havuzdan silme (diğer bağlantılar kullanabilir)
        if (this.queue) {
            try {
                // Sadece kuyruktaki işlemleri temizle ama kuyruğu yok etme
                this.queue.clear();
                
                // Kuyruk kullanım sayacını azalt
                const currentCount = queueUsageCounter.get(this.queueId) || 0;
                if (currentCount > 0) {
                    queueUsageCounter.set(this.queueId, currentCount - 1);
                    backendLogger.info(`Decreased usage count for queue ${this.queueId} to ${currentCount - 1}`, "SerialConnection");
                }
                
                // Eğer bu son kullanıcı ise, kuyruğu havuzdan tamamen kaldır.
                if (currentCount <= 1) {
                    if (serialQueuePool.has(this.queueId)) {
                        const q = serialQueuePool.get(this.queueId);
                        q?.clear();
                        q?.pause();
                        serialQueuePool.delete(this.queueId);
                        queueUsageCounter.delete(this.queueId);
                        backendLogger.info(`Queue ${this.queueId} has no more users and has been removed from the pool.`, "SerialConnection");
                    }
                }
                this.queue = null;
            } catch (queueErr: unknown) {
                const errorMsg = queueErr instanceof Error ? queueErr.message : String(queueErr);
                backendLogger.warning(`Error clearing queue for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
            }
        }
        
        this.cleanupListenersWithTimeout(2000).catch(() => {});
        
        try {
            if (this.client) {
                if (typeof this.client.close === 'function') {
                    try {
                        this.client.close(() => {}); // Provide empty callback to match signature
                    } catch (closeErr: unknown) {
                        const errorMsg = closeErr instanceof Error ? closeErr.message : String(closeErr);
                        // Only log non-standard errors as warnings
                        if (!errorMsg.includes('Port is not open')) {
                            backendLogger.warning(`Error in client.close() for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                        }
                    }
                }
                
                if (this.client._port) {
                    if (typeof this.client._port.close === 'function') {
                        try {
                            // Check port status - don't call close() if already closed
                            const port = this.client._port as any;
                            if (!(port.isOpen === false || port.destroyed === true)) {
                                this.client._port.close();
                            }
                        } catch (portCloseErr: unknown) {
                            const errorMsg = portCloseErr instanceof Error ? portCloseErr.message : String(portCloseErr);
                            // Only log non-standard errors as warnings
                            if (!errorMsg.includes('Port is not open')) {
                                backendLogger.warning(`Error in port.close() for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                            }
                        }
                    }
                    
                    if (typeof this.client._port.destroy === 'function') {
                        try {
                            this.client._port.destroy();
                        } catch (destroyErr: unknown) {
                            // Ignore destroy errors
                        }
                    }
                    
                    try {
                        const client = this.client as { _port?: unknown };
                        if (client && client._port) {
                            client._port = null;
                        }
                    } catch (nullErr: unknown) {
                        // Ignore errors when nullifying port
                    }
                }
            }
        } catch (err: unknown) {
            // Ignore general close errors
        } finally {
            this.client = null;
            this.portListeners.clear();
        }
    }
}