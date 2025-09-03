import ModbusRTU from "modbus-serial";
import PQueue from "p-queue";
import { backendLogger } from "../logger/BackendLogger";
import { ModbusConnection } from "./ModbusConnection";
/* eslint-disable @typescript-eslint/no-explicit-any */
// Serial portlar için paylaşılan queue'lar - KALDIRILDI (timeout sorununa neden oluyordu)
// const serialPortQueues = new Map<string, PQueue>();

interface ConnectionOptions {
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    port?: number;
}


/**
 * ModbusSerialConnection sınıfı - Seri port bağlantısını yönetir
 */
export class ModbusSerialConnection extends ModbusConnection {
    portName: string;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;

    constructor(portName: string, options: ConnectionOptions = {}) {
        super(portName);
        this.portName = portName;
        this.baudRate = options.baudRate || 9600;
        this.dataBits = options.dataBits || 8;
        this.stopBits = options.stopBits || 1;
        this.parity = options.parity || 'none';
        
        // Serial için concurrency'yi başlangıçta 1 olarak ayarla
        this.concurrency = 1;
    }

    /**
     * Serial connection için kendi queue'sunu oluşturur (paylaşım yok)
     * Her serial connection kendi queue'sunu kullanır - referans kodla uyumlu
     */
    protected createOwnQueue(): PQueue {
        const concurrency = 1; // Serial portlar için concurrency her zaman 1 olmalı
        backendLogger.debug(`Creating own queue for ${this.portName}, concurrency: ${concurrency}`, "SerialConnection");
        
        const queue = new PQueue({
            concurrency: concurrency,
            autoStart: true,
            throwOnTimeout: true,
            carryoverConcurrencyCount: true
        });
        
        return queue;
    }

    // lastSlaveId takibi kaldırıldı - referans kodla uyumlu hale getirildi

    /**
     * Akıllı timeout hesaplama - UI değeri + RTT tabanlı minimum koruma
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
        
        if (finalTimeout !== userTimeout) {
            //backendLogger.debug(`${this.connectionId} timeout adjusted: UI=${userTimeout}ms, RTT=${this.avgRTT}ms, capped=${cappedRTT}ms, multiplier=${multiplier}, min=${rttMinimum}ms, final=${finalTimeout}ms`, "ModbusConnection");
        }
        
        return finalTimeout;
    }

    /**
     * RTT değerini günceller
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
     * Okuma hatalarını işler
     */
    handleReadError(err: any): void {
        super.handleReadError(err);
        // REFERANS kodunda timeout strike mekanizması yok - kaldırıldı
        // Sadece basit hata işleme yapılıyor
    }

    /**
     * Modbus üzerinden register okur - Serial için optimize edilmiş versiyon
     */
    async readHoldingRegisters(slaveId: number, startAddr: number, quantity: number, timeoutMs: number): Promise<number[]> {
        backendLogger.debug(`[SERIAL] ReadHoldingRegisters called: slaveId=${slaveId}, startAddr=${startAddr}, quantity=${quantity}, timeout=${timeoutMs}ms`, "SerialConnection");
        
        if (!this.client || !this.isConnected) {
            backendLogger.error(`[SERIAL] Connection not established: client=${!!this.client}, isConnected=${this.isConnected}`, "SerialConnection");
            throw new Error("Connection is not established");
        }

        if (!this.queue) {
            backendLogger.error(`[SERIAL] Queue not initialized`, "SerialConnection");
            throw new Error("Queue is not initialized");
        }

        backendLogger.debug(`[SERIAL] Queue status: size=${this.queue.size}, pending=${this.queue.pending}, concurrency=${this.queue.concurrency}`, "SerialConnection");

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

                    // Referans kodla tamamen uyumlu - basit ve temiz
                    this.client.setID(Math.max(1, Math.min(255, slaveId)));
                    
                    // Akıllı timeout - UI değeri + RTT tabanlı koruma
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

            // Başarılı okuma, timeout sayacını sıfırlar
            this.timeoutStrikes = 0;

            if (result && 'data' in result) {
                return result.data;
            }
            throw new Error("Invalid response from Modbus device");
        } catch (err: unknown) {
            const elapsed = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);
            backendLogger.warning(`Read error (${slaveId}:${startAddr}x${quantity}): ${errorMessage} (took ${elapsed}ms)`, "SerialConnection", { connectionId: this.connectionId });
            
            this.handleReadError(err);
            throw err;
        }
    }

    /**
     * Modbus üzerinden tek register yazar - Serial için optimize edilmiş versiyon
     */
    async writeHoldingRegister(slaveId: number, address: number, value: number, timeoutMs: number): Promise<void> {
        backendLogger.debug(`[SERIAL] WriteHoldingRegister called: slaveId=${slaveId}, address=${address}, value=${value}, timeout=${timeoutMs}ms`, "SerialConnection");
        
        if (!this.client || !this.isConnected) {
            backendLogger.error(`[SERIAL] Connection not established: client=${!!this.client}, isConnected=${this.isConnected}`, "SerialConnection");
            throw new Error("Connection is not established");
        }

        if (!this.queue) {
            backendLogger.error(`[SERIAL] Queue not initialized`, "SerialConnection");
            throw new Error("Queue is not initialized");
        }

        const startTime = Date.now();

        try {
            const result = await this.queue.add(
                async () => {
                    if (!this.client || !this.isConnected) {
                        throw new Error("Connection lost");
                    }

                    // Serial için basit ve temiz
                    this.client.setID(Math.max(1, Math.min(255, slaveId)));
                    
                    // Akıllı timeout
                    const smartTimeout = this.calculateSmartTimeout(timeoutMs);
                    this.client.setTimeout(smartTimeout);

                    return this.client.writeRegister(address, value);
                },
                {
                    priority: Math.max(1, 10 - Math.min(9, Math.floor(address / 1000))),
                    timeout: this.calculateSmartTimeout(timeoutMs) + 500
                }
            );

            const elapsed = Date.now() - startTime;
            this.updateRTT(elapsed);

            // Başarılı yazma, timeout sayacını sıfırlar
            this.timeoutStrikes = 0;

            backendLogger.info(`[SERIAL] Write successful: ${this.connectionId} - Slave:${slaveId}, Addr:${address}, Value:${value}`, "SerialConnection");

        } catch (err: unknown) {
            const elapsed = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);
            backendLogger.warning(`[SERIAL] Write error (${slaveId}:${address}=${value}): ${errorMessage} (took ${elapsed}ms)`, "SerialConnection", { connectionId: this.connectionId });
            
            this.handleWriteError(err);
            throw err;
        }
    }

    /**
     * Modbus üzerinden çoklu register yazar - Serial için optimize edilmiş versiyon
     */
    async writeHoldingRegisters(slaveId: number, address: number, values: number[], timeoutMs: number): Promise<void> {
        backendLogger.debug(`[SERIAL] WriteHoldingRegisters called: slaveId=${slaveId}, address=${address}, values=[${values.join(',')}], timeout=${timeoutMs}ms`, "SerialConnection");
        
        if (!this.client || !this.isConnected) {
            throw new Error("Connection is not established");
        }

        if (!this.queue) {
            throw new Error("Queue is not initialized");
        }

        const startTime = Date.now();

        try {
            const result = await this.queue.add(
                async () => {
                    if (!this.client || !this.isConnected) {
                        throw new Error("Connection lost");
                    }

                    this.client.setID(Math.max(1, Math.min(255, slaveId)));
                    
                    const smartTimeout = this.calculateSmartTimeout(timeoutMs);
                    this.client.setTimeout(smartTimeout);

                    return this.client.writeRegisters(address, values);
                },
                {
                    priority: Math.max(1, 10 - Math.min(9, Math.floor(address / 1000))),
                    timeout: this.calculateSmartTimeout(timeoutMs) + 500
                }
            );

            const elapsed = Date.now() - startTime;
            this.updateRTT(elapsed);
            this.timeoutStrikes = 0;

            backendLogger.info(`[SERIAL] Write multiple successful: ${this.connectionId} - Slave:${slaveId}, Addr:${address}, Values:[${values.join(',')}]`, "SerialConnection");

        } catch (err: unknown) {
            const elapsed = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);
            backendLogger.warning(`[SERIAL] Write multiple error (${slaveId}:${address}=[${values.join(',')}]): ${errorMessage} (took ${elapsed}ms)`, "SerialConnection", { connectionId: this.connectionId });
            
            this.handleWriteError(err);
            throw err;
        }
    }

    /**
     * Yazma hatalarını işler (Serial için)
     */
    protected handleWriteError(err: any): void {
        super.handleWriteError(err);
        // Serial için basit hata işleme - timeout strike mekanizması yok
    }
    
    /**
     * Serial portlar için concurrency değerini her zaman 1 olarak zorla
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updateConcurrency(_forceUpdate: boolean = false): number {
        // Seri portlar doğası gereği sıralı çalışır. Eş zamanlılık her zaman 1 olmalıdır.
        // Bu fonksiyon, ana sınıfla uyumluluk için ve bu kuralı zorunlu kılmak için vardır.
        if (this.queue && this.queue.concurrency !== 1) {
             this.queue.concurrency = 1;
        }
        this.concurrency = 1;
        return 1;
    }
    
    /**
     * Seri port bağlantısı kurar
     */
    async connect(): Promise<void> {
        if (this.isConnected && this.client) {
            return;
        }
    
        try {
            // USB yeniden takıldığında eski handle'ları temizle
            if (this.client) {
                this.forceClosePort();
                // Kısa bir bekleme süresi ekle - Windows'un port handle'ını serbest bırakması için
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Sunucu yeniden başlatıldığında port handle çakışmasını önlemek için
            // Daha uzun bekleme süresi ekle
            backendLogger.debug(`[SERIAL] Waiting for port handle cleanup before connecting to ${this.portName}`, "SerialConnection");
            await new Promise(resolve => setTimeout(resolve, 500));
            
            backendLogger.info(`[SERIAL] Attempting connection to ${this.portName} with baudRate: ${this.baudRate}, dataBits: ${this.dataBits}, stopBits: ${this.stopBits}, parity: ${this.parity}`, "SerialConnection");
            
            // "Unknown error code 31" (SetCommState) hatası için retry mekanizması
            let connectionAttempts = 0;
            const maxAttempts = 3;
            let lastError: any = null;
            
            while (connectionAttempts < maxAttempts) {
                try {
                    connectionAttempts++;
                    backendLogger.debug(`[SERIAL] Connection attempt ${connectionAttempts}/${maxAttempts} for ${this.portName}`, "SerialConnection");
                    
                    this.client = new ModbusRTU();
                    await this.client.connectRTUBuffered(this.portName, {
                        baudRate: this.baudRate,
                        dataBits: this.dataBits,
                        stopBits: this.stopBits,
                        parity: this.parity,
                    });
                    
                    backendLogger.info(`[SERIAL] Successfully connected to ${this.portName} on attempt ${connectionAttempts}`, "SerialConnection");
                    break; // Başarılı bağlantı, döngüden çık
                    
                } catch (connectErr: any) {
                    lastError = connectErr;
                    const errorMsg = connectErr.message || String(connectErr);
                    
                    // "Unknown error code 31" (SetCommState) hatası için özel işlem
                    if (errorMsg.includes('Unknown error code 31') || errorMsg.includes('SetCommState')) {
                        backendLogger.warning(`[SERIAL] SetCommState error on attempt ${connectionAttempts}/${maxAttempts} for ${this.portName}: ${errorMsg}`, "SerialConnection");
                        
                        // Client'ı temizle
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
                        
                        // Son deneme değilse bekle
                        if (connectionAttempts < maxAttempts) {
                            const waitTime = connectionAttempts * 1000; // 1s, 2s, 3s
                            backendLogger.info(`[SERIAL] Waiting ${waitTime}ms before retry for ${this.portName}`, "SerialConnection");
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }
                    } else {
                        // Diğer hatalar için hemen çık
                        throw connectErr;
                    }
                }
            }
            
            // Tüm denemeler başarısız olduysa son hatayı fırlat
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
    
            backendLogger.debug(`Device count: ${this.deviceCount}`, "SerialConnection");
            
            // Her serial connection kendi queue'sunu oluşturur (paylaşım yok)
            this.queue = this.createOwnQueue();
            
            // Serial için concurrency'yi kesinlikle 1 olarak ayarla
            this.concurrency = 1;
            this.queue.concurrency = 1;
            
            backendLogger.debug(`Queue using concurrency: ${this.queue.concurrency} for connection ${this.connectionId}`, "SerialConnection");
            
            this.setupQueueEvents();
    
            this.isConnected = true;
            this.retryCount = 0;
            backendLogger.info(`Connected ${this.connectionId}`, "SerialConnection");
            this.emit('connected');
        } catch (err: unknown) {
            this.retryCount++;
            const errorMessage = err instanceof Error ? err.message : String(err);
            backendLogger.error(`Connection failed for ${this.connectionId}: ${errorMessage}`, "SerialConnection");
    
            this.emit('connectionLost');
            // Artık otomatik reconnect yapmıyoruz - SerialPoller register kontrolü ile karar verecek
            // this.scheduleReconnect(); // KALDIRILDI
            throw err;
        }
    }

    /**
     * Kuyruk olaylarını dinler
     */
    setupQueueEvents(): void {
        if (!this.queue) {
            backendLogger.warning(`${this.connectionId} Queue not created yet, cannot bind events`, "ModbusConnection");
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
     * Bağlantı kaybı durumunda event emit eder - reconnect kararını SerialPoller verir
     */
    protected handleConnectionLoss(): void {
        if (this.isShuttingDown) {
            backendLogger.debug(`Connection ${this.connectionId} is shutting down, ignoring connectionLost event.`, "SerialConnection");
            return;
        }
        if (!this.isConnected || this.connectionLostEmitted) return;

        this.isConnected = false;
        this.connectionLostEmitted = true; // Bayrağı ayarla
        
        // USB çıkarıldığında agresif port temizleme
        this.forceClosePort();
        this.emit('connectionLost');
        
        // Artık otomatik reconnect yapmıyoruz - SerialPoller register kontrolü ile karar verecek
        // this.scheduleReconnect(); // KALDIRILDI
    }

    /**
     * USB çıkarıldığında port handle'ını agresif şekilde temizler
     */
    public forceClosePort(): void {
        try {
            if (this.client && this.client._port) {
                const port = this.client._port as any;
                
                // Port durumunu zorla kapalı olarak işaretle
                if (port.isOpen !== undefined) {
                    try {
                        // Windows'ta isOpen property'si read-only olabilir, descriptor'ı değiştir
                        Object.defineProperty(port, 'isOpen', {
                            value: false,
                            writable: true,
                            configurable: true
                        });
                    } catch (propErr) {
                        // Property tanımlama başarısız olursa internal state'i değiştirmeye çalış
                        if (port._isOpen !== undefined) port._isOpen = false;
                        if (port.opened !== undefined) port.opened = false;
                    }
                }
                
                // Port'u destroyed olarak işaretle
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
                
                // Tüm listener'ları temizle
                if (typeof port.removeAllListeners === 'function') {
                    port.removeAllListeners();
                }
                
                // Port'u senkron olarak zorla kapat
                if (typeof port.close === 'function') {
                    try {
                        // Callback olmadan senkron close dene
                        if (port.close.length === 0) {
                            port.close();
                        } else {
                            // Callback ile async close
                            port.close(() => {});
                        }
                    } catch (closeErr) {
                        // Ignore close errors during force close
                    }
                }
                
                // Port'u zorla destroy et
                if (typeof port.destroy === 'function') {
                    try {
                        port.destroy();
                    } catch (destroyErr) {
                        // Ignore destroy errors during force close
                    }
                }
                
                // Port file descriptor'ını temizle (Windows için)
                if (port.fd !== undefined) {
                    try {
                        port.fd = null;
                    } catch (fdErr) {
                        // Ignore fd errors
                    }
                }
                
                // Port handle'ını temizle (Windows için)
                if (port.handle !== undefined) {
                    try {
                        port.handle = null;
                    } catch (handleErr) {
                        // Ignore handle errors
                    }
                }
                
                // Port referansını temizle
                this.client._port = undefined;
                backendLogger.debug(`Aggressively force closed and nullified port for ${this.connectionId}`, "SerialConnection");
            }
            
            // Client referansını da temizle
            this.client = null;
            this.portListeners.clear();
            
            // Connection state'ini sıfırla
            this.isConnected = false;
            this.connectionLostEmitted = false;
            
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            backendLogger.debug(`Error during aggressive force port close for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
        }
    }

    /**
     * TCP'deki gibi attemptReconnect metodu - PollingEngine tarafından çağrılır
     */
    public async attemptReconnect(): Promise<void> {
        if (this.isShuttingDown || this.isConnected) {
            return;
        }

        // Yeniden bağlanma denemesinden önce bu bayrağı sıfırla
        this.connectionLostEmitted = false;
        
        backendLogger.info(`Attempting to reconnect ${this.connectionId} (attempt ${this.retryCount + 1})`, "SerialConnection");
        try {
            await this.connect();
        } catch {
            // Hata zaten connect içinde ele alınıyor ve connectionLost yayılıyor
        }
    }

    /**
     * Yeniden bağlanma - REFERANS kodundan alındı
     * Artık sadece SerialPoller tarafından register kontrolü ile çağrılacak
     */
    public scheduleReconnect(delay = 30000): void {
        if ((this as any).reconnectTimer || this.isShuttingDown) return;
    
        backendLogger.info(`Reconnect ${this.connectionId} in ${delay / 1000}s`, this.constructor.name);
    
        (this as any).reconnectTimer = setTimeout(async () => {
            (this as any).reconnectTimer = null;
    
            try {
                await this.connect();
                this.emit('reconnected');
            } catch {
                // Hata zaten connect içinde ele alınıyor
            }
        }, delay);
    }
    
    /**
     * Seri port bağlantısını kapatır - gelişmiş port temizleme içerir
     */
    override close(): void {
        if (!this.isConnected && !this.client) {
            backendLogger.debug(`${this.connectionId} already closed, skipping`, "SerialConnection");
            return;
        }
        
        this.isConnected = false;
        
        
        if (this.queue) {
            try {
                backendLogger.debug(`Clearing queue for ${this.connectionId}`, "SerialConnection");
                this.queue.clear();
            } catch (queueErr: unknown) {
                const errorMsg = queueErr instanceof Error ? queueErr.message : String(queueErr);
                backendLogger.warning(`Error clearing queue for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
            }
        }
        
        backendLogger.debug(`Closing connection ${this.connectionId}...`, "SerialConnection");
        
        this.cleanupListenersWithTimeout(2000).then((success) => {
            if (!success) {
                backendLogger.warning(`Listener cleanup failed during close for ${this.connectionId}`, "SerialConnection");
            }
        });
        
        try {
            if (this.client) {
                if (typeof this.client.close === 'function') {
                    try {
                        this.client.close(() => {}); // Provide empty callback to match signature
                        backendLogger.debug(`Client close called for ${this.connectionId}`, "SerialConnection");
                    } catch (closeErr: unknown) {
                        const errorMsg = closeErr instanceof Error ? closeErr.message : String(closeErr);
                        // "Port is not open" hatası normal bir durum, warning yerine debug seviyesinde logla
                        if (errorMsg.includes('Port is not open')) {
                            backendLogger.debug(`Port already closed for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                        } else {
                            backendLogger.warning(`Error in client.close() for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                        }
                    }
                }
                
                if (this.client._port) {
                    if (typeof this.client._port.close === 'function') {
                        try {
                            // Port durumunu kontrol et - eğer zaten kapalıysa close() çağırma
                            const port = this.client._port as any;
                            if (port.isOpen === false || port.destroyed === true) {
                                backendLogger.debug(`Port already closed/destroyed for ${this.connectionId}`, "SerialConnection");
                            } else {
                                this.client._port.close();
                                backendLogger.debug(`Port close called for ${this.connectionId}`, "SerialConnection");
                            }
                        } catch (portCloseErr: unknown) {
                            const errorMsg = portCloseErr instanceof Error ? portCloseErr.message : String(portCloseErr);
                            // "Port is not open" hatası normal bir durum, warning yerine debug seviyesinde logla
                            if (errorMsg.includes('Port is not open')) {
                                backendLogger.debug(`Port already closed for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                            } else {
                                backendLogger.warning(`Error in port.close() for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                            }
                        }
                    }
                    
                    if (typeof this.client._port.destroy === 'function') {
                        try {
                            this.client._port.destroy();
                            backendLogger.debug(`Port destroy called for ${this.connectionId}`, "SerialConnection");
                        } catch (destroyErr: unknown) {
                            const errorMsg = destroyErr instanceof Error ? destroyErr.message : String(destroyErr);
                            // Destroy hatalarını da daha yumuşak ele al
                            backendLogger.debug(`Error in port.destroy() for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                        }
                    }
                    
                    try {
                        const client = this.client as { _port?: unknown };
                        if (client && client._port) {
                            client._port = null;
                            backendLogger.debug(`Port reference nullified for ${this.connectionId}`, "SerialConnection");
                        }
                    } catch (nullErr: unknown) {
                        const errorMsg = nullErr instanceof Error ? nullErr.message : String(nullErr);
                        backendLogger.debug(`Error nullifying port for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
                    }
                }
            }
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            // Genel hataları da daha yumuşak ele al
            backendLogger.debug(`Error during thorough close for ${this.connectionId}: ${errorMsg}`, "SerialConnection");
        } finally {
            this.client = null;
            this.portListeners.clear();
            backendLogger.debug(`Connection ${this.connectionId} fully closed`, "SerialConnection");
        }
    }
}