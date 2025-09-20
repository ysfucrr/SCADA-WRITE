/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "events";
import { Socket } from "net";
import ModbusRTU from "modbus-serial";
import PQueue from "p-queue";
import { backendLogger } from "../logger/BackendLogger";

const EXPONENTIAL_BACKOFF_BASE = 1000;
//const MIN_TIMEOUT_MS = 30000;
//const MAX_TIMEOUT_MS = 100000;
const MIN_TIMEOUT_MS = 500;  // Minimum timeout 500ms
const MAX_TIMEOUT_MS = 60000; // Maximum timeout 60 saniye
const MIN_WORKERS = 1;      // Minimum eşzamanlı işlem sayısı
const MAX_WORKERS = 64;     // Maximum eşzamanlı işlem sayısı
const PRE_WRITE_DELAY_MS = 500;  // Default delay before writing (500ms)
const POST_WRITE_DELAY_MS = 1000; // Default delay after writing (1000ms)

// ────────── Tip Tanımlamaları ──────────
interface ExtendedModbusRTU {
    _port?: Port;
    _client?: any; // Keep `any` as per instruction if specific type is complex
    connectTCP: (host: string, options: { port: number }) => Promise<void>;
    connectRTUBuffered: (path: string, options: any) => Promise<void>;
    setTimeout: (timeout: number) => void;
    setID: (id: number) => void;
    readHoldingRegisters: (address: number, length: number) => Promise<{ data: number[]; buffer: Buffer }>;
    readInputRegisters: (address: number, length: number) => Promise<{ data: number[]; buffer: Buffer }>;
    readCoils: (address: number, length: number) => Promise<{ data: boolean[]; buffer: Buffer }>;
    readDiscreteInputs: (address: number, length: number) => Promise<{ data: boolean[]; buffer: Buffer }>;
    writeRegister: (address: number, value: number) => Promise<any>;
    writeRegisters: (address: number, values: number[]) => Promise<any>;
    close: (callback: (err?: Error) => void) => void;
    isOpen?: boolean;
}

interface Port extends EventEmitter {
    close(callback?: (err?: Error) => void): void;
    destroy(): void;
    socket?: Socket | null;
    listenerCount(eventName: string | symbol): number;
    removeAllListeners(eventName?: string | symbol): this;
    eventNames(): Array<string | symbol>;
}


/**
 * ModbusConnection sınıfı - Modbus bağlantısını yönetir (Abstract Base Class)
 */
export abstract class ModbusConnection extends EventEmitter {
    connectionId: string;
    client: ExtendedModbusRTU | null = null;
    queue: PQueue | null = null;
    isConnected: boolean = false;
    isShuttingDown: boolean = false;
    retryCount: number = 0;
    connectionLostEmitted: boolean = false; // Bağlantı kaybı bildirimi yapıldı mı
    timeoutStrikes: number = 0; // Ardışık timeout sayacı
    
    // Performans metrikleri için alanlar
    avgRTT: number = 50; // Ortalama round trip time (ms) - başlangıç değeri
    deviceCount: number = 0; // Bağlı cihaz sayısı
    backlog: number = 0; // Bekleyen görev sayısı
    pollMs: number = 1000; // Varsayılan polling aralığı
    // Concurrency güncelleme zamanlaması (private olarak taşındı)
    rttSamples: number[] = []; // Son RTT örnekleri
    rttSampleSize: number = 50; // Son 50 RTT örneğini sakla (Daha stabil bir ortalama için artırıldı)
    concurrency: number = 0;
    
    // Loglama optimizasyonu için önceki değerler
    private lastLoggedAvgRTT: number = -1; // Son loglanan avgRTT değeri
    private lastLoggedConcurrency: number = -1; // Son loglanan concurrency değeri
    private lastLoggedFinalTimeout: number = -1; // Son loglanan final timeout degeri
    private avgRTTLoggedOnce: boolean = false; // AvgRTT en az bir kere loglandı mı
    
    // Listener yönetimi için alanlar
    protected portListeners: Map<string, (...args: any[]) => void> = new Map();
    protected isListenerCleanupInProgress: boolean = false;
    
    // Slave ID thread safety için lock (TCP bağlantılar için)
    private slaveIdLock: boolean = false;
    private slaveIdLockQueue: Array<() => void> = [];
    
    // Concurrency stabilizasyonu için
    private lastConcurrencyUpdate: number = 0;
    private concurrencyUpdateInterval: number = 5000; // 5 saniye minimum interval
    private loggedOnce: Set<string> = new Set(); // Tekrar eden logları önlemek için
    
    // Device-level state tracking (queue değil, sadece state!)

    /**
     * TCP bağlantılar için slave ID lock'unu alır
     */
    protected async acquireSlaveIdLock(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.slaveIdLock) {
                this.slaveIdLock = true;
                resolve();
            } else {
                this.slaveIdLockQueue.push(resolve);
            }
        });
    }

    /**
     * TCP bağlantılar için slave ID lock'unu serbest bırakır
     */
    protected releaseSlaveIdLock(): void {
        if (this.slaveIdLockQueue.length > 0) {
            const nextResolve = this.slaveIdLockQueue.shift();
            if (nextResolve) {
                nextResolve();
            }
        } else {
            this.slaveIdLock = false;
        }
    }

    constructor(connectionId: string) {
        super();
        this.connectionId = connectionId;
    }

    /**
     * Utility sleep function for delays
     */
    protected async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    
    
    

    /**
     * Akıllı timeout hesaplama - UI değeri + RTT tabanlı minimum koruma
     * @param userTimeout Kullanıcının UI'den girdiği timeout değeri (ms)
     * @returns Hesaplanmış güvenli timeout değeri (ms)
     */
    calculateSmartTimeout(userTimeout: number): number {
        const rtt = this.avgRTT;
        let multiplier = 4;

        if (rtt > 2000) { // Çok yüksek gecikme
            multiplier = 10;
        } else if (rtt > 1000) { // Yüksek gecikme
            multiplier = 8;
        } else if (rtt > 500) { // Orta gecikme
            multiplier = 6;
        }

        // RTT tabanlı minimum güvenlik payı. En az 2 saniye bekle.
        const rttMinimum = Math.max(2000, rtt * multiplier);

        // Kullanıcı değeri ile RTT minimum'unun büyüğü
        const smartTimeout = Math.max(userTimeout, rttMinimum);

        // Makul üst limit 60 saniye
        const finalTimeout = Math.min(smartTimeout, MAX_TIMEOUT_MS);

        // RTT timeout update logları kaldırıldı - log spam'ini önlemek için
        // Sadece ilk timeout set edildiğinde logla
        if (this.lastLoggedFinalTimeout === -1) {
            backendLogger.info(`${this.connectionId} timeout set: ${finalTimeout.toFixed(0)}ms (RTT: ${this.avgRTT.toFixed(1)}ms, UI: ${userTimeout}ms)`, "ModbusConnection");
            this.lastLoggedFinalTimeout = finalTimeout;
        } else {
            // Sessizce güncelle
            this.lastLoggedFinalTimeout = finalTimeout;
        }

        return finalTimeout;
    }

    /**
     * Güvenli listener temizleme - takip sistemi ile
     * Hem TCP hem de Serial bağlantılar için kullanılabilir
     */
    protected async safeRemoveListeners(): Promise<boolean> {
        if (this.isListenerCleanupInProgress) {
            return false; // Zaten temizlik yapılıyor
        }

        this.isListenerCleanupInProgress = true;
        let success = true;

        try {
            const port = this.client?._port;
            if (port && typeof port.removeAllListeners === 'function') {
                // Hem TCP hem Serial için ortak event'ler
                const eventNames = ['error', 'close', 'data', 'timeout', 'connect', 'end'];
                
                for (const eventName of eventNames) {
                    try {
                        const listenerCount = port.listenerCount ? port.listenerCount(eventName) : 0;
                        if (listenerCount > 0) {
                            port.removeAllListeners(eventName);
                            backendLogger.debug(`Removed ${listenerCount} ${eventName} listeners for ${this.connectionId}`, "ModbusConnection");
                        }
                    } catch (err) {
                        success = false;
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        backendLogger.warning(`Failed to remove ${eventName} listeners for ${this.connectionId}: ${errorMsg}`, "ModbusConnection");
                    }
                }

                // TCP için socket listener'ları da temizle
                if (port.socket && typeof port.socket.removeAllListeners === 'function') {
                    try {
                        const socketEvents = ['error', 'close', 'timeout', 'connect', 'end'];
                        for (const eventName of socketEvents) {
                            const listenerCount = port.socket.listenerCount ? port.socket.listenerCount(eventName) : 0;
                            if (listenerCount > 0) {
                                port.socket.removeAllListeners(eventName);
                                backendLogger.debug(`Removed ${listenerCount} socket ${eventName} listeners for ${this.connectionId}`, "ModbusConnection");
                            }
                        }
                    } catch (err) {
                        success = false;
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        backendLogger.warning(`Failed to remove socket listeners for ${this.connectionId}: ${errorMsg}`, "ModbusConnection");
                    }
                }
            }
        } catch (err) {
            success = false;
            const errorMsg = err instanceof Error ? err.message : String(err);
            backendLogger.error(`Critical error during listener cleanup for ${this.connectionId}: ${errorMsg}`, "ModbusConnection");
        } finally {
            this.isListenerCleanupInProgress = false;
        }

        return success;
    }

    /**
     * Güvenli listener ekleme - mükerrer eklemeyi önler
     * Hem TCP hem de Serial bağlantılar için kullanılabilir
     */
    protected safeAddListener(eventName: string, handler: (...args: unknown[]) => void): void {
        const port = this.client?._port;
        if (!port) return;

        // KESİN ÇÖZÜM: Porta zaten bu event için bir dinleyici atanmış mı diye KENDİSİNE sor.
        // Bu, yeniden bağlanma döngülerinde mükerrer eklemeyi tamamen engeller.
        if (typeof port.listenerCount === 'function' && port.listenerCount(eventName) > 0) {
            return; // Zaten bir dinleyici var, tekrar ekleme.
        }

        // Yeni listener'ı ekle ve kendi listemize de kaydet
        port.on(eventName, handler);
        this.portListeners.set(eventName, handler);
        backendLogger.debug(`Added ${eventName} listener for ${this.connectionId}`, "ModbusConnection");
    }

    /**
     * Socket için güvenli listener ekleme (TCP için)
     */
    protected safeAddSocketListener(eventName: string, handler: (...args: unknown[]) => void): void {
        const socket = this.client?._port?.socket;
        if (!socket) return;

        // Önce aynı tip listener var mı kontrol et
        const listenerKey = `socket_${eventName}`;
        const existingHandler = this.portListeners.get(listenerKey);
        if (existingHandler) {
            try {
                socket.removeListener(eventName, existingHandler);
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                backendLogger.warning(`Error removing existing socket ${eventName} listener: ${errorMsg}`, "ModbusConnection");
            }
        }

        // Yeni listener'ı ekle ve kaydet
        socket.on(eventName, handler);
        this.portListeners.set(listenerKey, handler);
        backendLogger.debug(`Added socket ${eventName} listener for ${this.connectionId}`, "ModbusConnection");
    }

    /**
     * Asenkron listener temizleme - timeout ile
     */
    protected async cleanupListenersWithTimeout(timeoutMs: number = 5000): Promise<boolean> {
        return new Promise((resolve) => {
            const cleanup = async () => {
                try {
                    const port = this.client?._port;
                    if (!port) {
                        resolve(true);
                        return;
                    }

                    // Listener sayısını kontrol et
                    let totalListeners = 0;
                    if (port.eventNames && typeof port.eventNames === 'function') {
                        totalListeners = port.eventNames()
                            .reduce((total: number, eventName: string | symbol) => {
                                const count = port.listenerCount ? port.listenerCount(eventName) : 0;
                                return total + count;
                            }, 0);
                    }

                    if (totalListeners === 0) {
                        resolve(true);
                        return;
                    }

                    // Listener'ları temizle
                    const success = await this.safeRemoveListeners();
                    
                    // Temizlik doğrulaması
                    let remainingListeners = 0;
                    if (port.eventNames && typeof port.eventNames === 'function') {
                        remainingListeners = port.eventNames()
                            .reduce((total: number, eventName: string | symbol) => {
                                const count = port.listenerCount ? port.listenerCount(eventName) : 0;
                                return total + count;
                            }, 0);
                    }

                    if (remainingListeners === 0) {
                        backendLogger.debug(`Successfully cleaned ${totalListeners} listeners for ${this.connectionId}`, "ModbusConnection");
                        resolve(true);
                    } else {
                        backendLogger.warning(`${remainingListeners} listeners still remain after cleanup for ${this.connectionId}`, "ModbusConnection");
                        resolve(success);
                    }
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    backendLogger.error(`Listener cleanup failed for ${this.connectionId}: ${errorMsg}`, "ModbusConnection");
                    resolve(false);
                }
            };

            // Timeout ile cleanup
            const timeoutId = setTimeout(() => {
                backendLogger.warning(`Listener cleanup timeout for ${this.connectionId}`, "ModbusConnection");
                resolve(false);
            }, timeoutMs);

            cleanup().finally(() => clearTimeout(timeoutId));
        });
    }

    /**
     * Bağlantıyı başlatır - alt sınıflarda implemente edilecek
     */
    abstract connect(): Promise<void>;

    /**
     * Bağlantıyı kapatır
     */
    close(): void {
        this.isShuttingDown = true;
        this.isConnected = false;

        // Slave ID lock'unu temizle ve bekleyen tüm Promise'leri reject et
        if (this.slaveIdLockQueue.length > 0) {
            this.slaveIdLockQueue.forEach(resolve => {
                try {
                    resolve(); // Bekleyen işlemleri serbest bırak
                } catch (err) {
                    // Ignore errors during shutdown
                }
            });
            this.slaveIdLockQueue.length = 0;
        }
        this.slaveIdLock = false;

        if (this.queue) {
            this.queue.pause();
            this.queue.removeAllListeners();
            this.queue.clear();
            this.queue = null;
            backendLogger.debug(`[Graceful Shutdown] Queue for ${this.connectionId} has been destroyed.`, "ModbusConnection");
        }

        try {
            if (this.client) {
                const port = this.client._port;
                if (port) {
                    if (port.socket) {
                        port.socket.destroy();
                        backendLogger.debug(`[Graceful Shutdown] Socket for ${this.connectionId} destroyed.`, "ModbusConnection");
                    }
                    if (typeof port.destroy === 'function') {
                        port.destroy();
                        backendLogger.debug(`[Graceful Shutdown] Port for ${this.connectionId} destroyed.`, "ModbusConnection");
                    }
                    (this.client as any)._port = undefined;
                }
                if (typeof this.client.close === 'function') {
                    this.client.close(() => {});
                    backendLogger.debug(`[Graceful Shutdown] Modbus client for ${this.connectionId} closed.`, "ModbusConnection");
                }
            }
        } catch (err: any) {
            backendLogger.warning(`[Graceful Shutdown] Error during aggressive close for ${this.connectionId}: ${err.message}`, "ModbusConnection");
        } finally {
            this.client = null;
            this.portListeners.clear();
            backendLogger.debug(`[Graceful Shutdown] All references for ${this.connectionId} have been nullified.`, "ModbusConnection");
        }
    }


    /**
     * IMPROVED: Modbus üzerinden register okur - Smart coordination ile
     * Sadece ilgili cihaz write yapıyorsa bekler, diğer cihazlar etkilenmez
     */
    async readHoldingRegisters(slaveId: number, startAddr: number, quantity: number, timeoutMs: number): Promise<number[]> {
        // "Force shutdown" kontrolü: Eğer kuyruk kapatma sırasında yok edildiyse,
        // timeout beklemeden işlemi anında sonlandır.
        if (!this.queue) {
            backendLogger.warning(`[Force Shutdown] readHoldingRegisters on ${this.connectionId} cancelled: Queue has been destroyed.`, "ModbusConnection");
            throw new Error("Queue has been destroyed during connection shutdown.");
        }

        if (!this.client || !this.isConnected) {
            throw new Error("Connection is not established");
        }

        const readPriority = 0;

        const startTime = Date.now();

        // Polling zamanı güncelle (min 100ms)
        if (timeoutMs > 100) {
            this.pollMs = timeoutMs;
        }

        try {
            // İşlemi kuyruğa ekle
            const result = await this.queue.add(
                async () => {

                    // FORCE SHUTDOWN KONTROLÜ: Eğer bağlantı kapatılma sürecindeyse,
                    // bu görevi hemen iptal et ve timeout beklemesini engelle.
                    if (this.isShuttingDown) {
                        backendLogger.debug(`[Force Shutdown] Operation cancelled for ${this.connectionId} because connection is shutting down.`, "ModbusConnection");
                        throw new Error("Connection is shutting down, operation cancelled.");
                    }

                    if (!this.client || !this.isConnected) {
                        throw new Error("Connection lost");
                    }

                    // TCP bağlantılar için slave ID thread safety
                    if (this instanceof ModbusTcpConnection) {
                        await this.acquireSlaveIdLock();
                    }

                    try {
                        this.client.setID(Math.max(1, Math.min(255, slaveId)));

                        // Akıllı timeout - UI değeri + RTT tabanlı koruma
                        const smartTimeout = this.calculateSmartTimeout(timeoutMs);
                        this.client.setTimeout(smartTimeout);

                        return this.client.readHoldingRegisters(startAddr, quantity);
                    } finally {
                        // TCP bağlantılar için slave ID lock'unu serbest bırak
                        if (this instanceof ModbusTcpConnection) {
                            this.releaseSlaveIdLock();
                        }
                    }
                },
                {
                    // Priority-based scheduling: Write varsa düşük öncelik
                    priority: readPriority,
                    // Akıllı queue timeout - UI değeri + buffer (yüksek RTT için artırıldı)
                    timeout: this.calculateSmartTimeout(timeoutMs) + 1000
                }
            );

            // RTT hesapla ve güncelle
            const elapsed = Date.now() - startTime;
            this.updateRTT(elapsed);
            
            // Başarılı okuma, timeout sayacını sıfırlar
            this.timeoutStrikes = 0;

            if (result && 'data' in result) {
                return result.data;
            }
            throw new Error("Invalid response from Modbus device");
        } catch (err: any) {
            // "Slave device busy" hatasını sessizce yönet - read işlemlerini kesintiye uğratma
            if (err.message && err.message.includes("Modbus exception 6")) {
                backendLogger.debug(`⚠️ READ DEVICE BUSY: Slave device busy (${slaveId}:${startAddr}). Silently skipping read operation.`, "ModbusConnection", { connectionId: this.connectionId });
                // Hata fırlatmayarak PollingEngine'in 5 saniye beklemesini engelle.
                // Ancak döngünün devam etmesi için boş bir dizi döndürerek hatayı sessizce geçiştir.
                return [];
            }

            // Diğer device busy benzeri hataları da sessizce yönet
            const isDeviceBusy = err.message && (
                err.message.includes("Slave device busy") ||
                err.message.includes("device busy") ||
                err.message.includes("busy")
            );

            if (isDeviceBusy) {
                backendLogger.debug(`⚠️ READ DEVICE BUSY: Device busy detected during read (${slaveId}:${startAddr}). Silently skipping.`, "ModbusConnection", { connectionId: this.connectionId });
                return [];
            }

            // NİHAİ ÇÖZÜM: Hata yakalandığında, bunun bir kapatma sürecinin parçası olup olmadığını kontrol et.
            if (this.isShuttingDown || !this.queue) {
                // Eğer bağlantı kapatılıyorsa, bu hata (örn: Timeout) beklenen bir sonuçtur.
                // Bunu bir uyarı olarak loglamak yerine, sessizce geç.
                const newErr = new Error(`Read operation cancelled during shutdown for ${this.connectionId}.`);
                // throw newErr; // Akışı kesmek için yeni bir hata fırlat, ancak bunu yukarıda yakalayıp görmezden gel.
                return Promise.reject(newErr); // Promise reddederek polling döngüsünü temiz bir şekilde sonlandır.
            }

            const elapsed = Date.now() - startTime;

            // Kritik hatalar için error, diğerleri için warning
            if (err.message && (
                err.message.includes("Port Not Open") ||
                err.message.includes("Connection lost") ||
                err.message.includes("ECONNRESET")
            )) {
                backendLogger.error(`Critical read error (${slaveId}:${startAddr}x${quantity}): ${err.message} (took ${elapsed}ms)`, "ModbusConnection", { connectionId: this.connectionId });
            } else {
                backendLogger.warning(`Read error (${slaveId}:${startAddr}x${quantity}): ${err.message} (took ${elapsed}ms)`, "ModbusConnection", { connectionId: this.connectionId });
            }

            this.handleReadError(err);
            throw err;
        }
    }


    /**
     * Modbus üzerinden tek bir register'a yazar (FC06) - Device busy koruması ile
     */
    async writeHoldingRegister(slaveId: number, address: number, value: number, timeoutMs: number): Promise<void> {
        return this.writeHoldingRegisterWithRetry(slaveId, address, value, timeoutMs);
    }


    /**
     * Device busy hatalarını yakalayıp sessizce yöneten write metodu
     */
    async writeHoldingRegisterWithRetry(slaveId: number, address: number, value: number, timeoutMs: number, maxRetries: number = 3): Promise<void> {
        if (!this.queue) {
            throw new Error("Main queue not initialized");
        }

        const startTime = Date.now();
        backendLogger.debug(`✏️ WRITE OPERATION: Starting write operation for ${this.connectionId} (Slave: ${slaveId}, Address: ${address}, Value: ${value}) - Priority: 10`, "ModbusConnection");

        try {
            backendLogger.debug(`✏️ WRITE QUEUE: Adding write operation to MAIN QUEUE for ${this.connectionId} - Priority: 10`, "ModbusConnection");
            await this.queue.add(
                async () => {
                    backendLogger.debug(`✏️ WRITE EXEC: Starting write operation execution for ${this.connectionId} (Slave: ${slaveId}, Address: ${address}, Value: ${value})`, "ModbusConnection");
                    let lastError: any = null;

                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        try {
                            if (this.isShuttingDown) {
                                throw new Error("Connection is shutting down, operation cancelled.");
                            }

                            if (!this.client || !this.isConnected) {
                                throw new Error("Connection lost");
                            }

                            if (this instanceof ModbusTcpConnection) {
                                await this.acquireSlaveIdLock();
                            }

                            try {
                                this.client.setID(Math.max(1, Math.min(255, slaveId)));
                                const smartTimeout = this.calculateSmartTimeout(timeoutMs);
                                this.client.setTimeout(smartTimeout);

                                // Write öncesi kısa bekleme
                                await this.sleep(100);

                                backendLogger.debug(`✏️ WRITE MODBUS: Executing Modbus write for ${this.connectionId} (Slave: ${slaveId}, Address: ${address}, Value: ${value})`, "ModbusConnection");
                                const response = await this.client.writeRegister(address, value);

                                // Write sonrası bekleme
                                await this.sleep(200);

                                return response;
                            } finally {
                                if (this instanceof ModbusTcpConnection) {
                                    this.releaseSlaveIdLock();
                                }
                            }
                        } catch (err: any) {
                            lastError = err;

                            // Device busy hatası mı kontrol et
                            const isDeviceBusy = err.message && (
                                err.message.includes("Modbus exception 6") ||
                                err.message.includes("Slave device busy") ||
                                err.message.includes("device busy") ||
                                err.message.includes("busy")
                            );

                            if (isDeviceBusy) {
                                backendLogger.debug(`⚠️ WRITE RETRY: Device busy detected for ${this.connectionId} (attempt ${attempt}/${maxRetries}). Retrying...`, "ModbusConnection");

                                // Device busy ise biraz daha bekle
                                if (attempt < maxRetries) {
                                    await this.sleep(500 * attempt); // Artan bekleme süresi
                                    continue;
                                }
                            }

                            // Diğer hatalar için de retry dene ama daha az agresif
                            if (attempt < maxRetries && !isDeviceBusy) {
                                await this.sleep(200 * attempt);
                                continue;
                            }

                            throw err;
                        }
                    }

                    throw lastError;
                },
                {
                    priority: 10, // Write'lara yüksek öncelik
                    timeout: this.calculateSmartTimeout(timeoutMs) + 2000
                }
            );

            const elapsed = Date.now() - startTime;
            backendLogger.info(`✅ WRITE SUCCESS: Write completed successfully (${this.connectionId}:${slaveId}:${address} = ${value}) (took ${elapsed}ms)`, "ModbusConnection");

        } catch (err: any) {
            const elapsed = Date.now() - startTime;
            const errorMessage = err.message || String(err);

            // Device busy hatalarını warning olarak logla, diğerlerini error olarak
            if (errorMessage.includes("Modbus exception 6") || errorMessage.includes("Slave device busy")) {
                backendLogger.warning(`❌ WRITE FAILED: Write failed due to device busy (${this.connectionId}:${slaveId}:${address}): ${errorMessage} (took ${elapsed}ms)`, "ModbusConnection");
            } else {
                backendLogger.error(`❌ WRITE ERROR: Write error (${this.connectionId}:${slaveId}:${address}): ${errorMessage} (took ${elapsed}ms)`, "ModbusConnection");
            }

            this.handleReadError(err);
            throw err;
        }
    }

    /**
     * Modbus üzerinden birden çok register'a yazar (FC16) - Device busy koruması ile
     */
    async writeHoldingRegisters(slaveId: number, address: number, values: number[], timeoutMs: number): Promise<void> {
        return this.writeHoldingRegistersWithRetry(slaveId, address, values, timeoutMs);
    }

    /**
     * Modbus üzerinden birden çok register'a yazar (FC16) - Device busy koruması ile
     */
    async writeHoldingRegistersWithRetry(slaveId: number, address: number, values: number[], timeoutMs: number, maxRetries: number = 3): Promise<void> {
        if (!this.queue) {
            throw new Error("Main queue not initialized");
        }

        const startTime = Date.now();
        backendLogger.debug(`✏️ WRITE MULTIPLE: Starting write multiple operation for ${this.connectionId} (Slave: ${slaveId}, Address: ${address}, Count: ${values.length}) - Priority: 10`, "ModbusConnection");

        try {
            backendLogger.debug(`✏️ WRITE MULTIPLE QUEUE: Adding write multiple operation to MAIN QUEUE for ${this.connectionId} - Priority: 10`, "ModbusConnection");
            await this.queue.add(
                async () => {
                    backendLogger.debug(`✏️ WRITE MULTIPLE EXEC: Starting write multiple execution for ${this.connectionId} (Slave: ${slaveId}, Address: ${address}, Count: ${values.length})`, "ModbusConnection");
                    let lastError: any = null;

                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        try {
                            if (this.isShuttingDown) {
                                throw new Error("Connection is shutting down, operation cancelled.");
                            }

                            if (!this.client || !this.isConnected) {
                                throw new Error("Connection lost");
                            }

                            if (this instanceof ModbusTcpConnection) {
                                await this.acquireSlaveIdLock();
                            }

                            try {
                                this.client.setID(Math.max(1, Math.min(255, slaveId)));
                                const smartTimeout = this.calculateSmartTimeout(timeoutMs);
                                this.client.setTimeout(smartTimeout);

                                // Write öncesi kısa bekleme
                                await this.sleep(100);

                                backendLogger.debug(`✏️ WRITE MULTIPLE MODBUS: Executing Modbus write multiple for ${this.connectionId} (Slave: ${slaveId}, Address: ${address}, Count: ${values.length})`, "ModbusConnection");
                                const response = await this.client.writeRegisters(address, values);

                                // Write sonrası bekleme
                                await this.sleep(200);

                                return response;
                            } finally {
                                if (this instanceof ModbusTcpConnection) {
                                    this.releaseSlaveIdLock();
                                }
                            }
                        } catch (err: any) {
                            lastError = err;

                            // Device busy hatası mı kontrol et
                            const isDeviceBusy = err.message && (
                                err.message.includes("Modbus exception 6") ||
                                err.message.includes("Slave device busy") ||
                                err.message.includes("device busy") ||
                                err.message.includes("busy")
                            );

                            if (isDeviceBusy) {
                                backendLogger.debug(`⚠️ WRITE MULTIPLE RETRY: Device busy detected for ${this.connectionId} (attempt ${attempt}/${maxRetries}). Retrying...`, "ModbusConnection");

                                // Device busy ise biraz daha bekle
                                if (attempt < maxRetries) {
                                    await this.sleep(500 * attempt); // Artan bekleme süresi
                                    continue;
                                }
                            }

                            // Diğer hatalar için de retry dene ama daha az agresif
                            if (attempt < maxRetries && !isDeviceBusy) {
                                await this.sleep(200 * attempt);
                                continue;
                            }

                            throw err;
                        }
                    }

                    throw lastError;
                },
                {
                    priority: 10, // Write'lara yüksek öncelik
                    timeout: this.calculateSmartTimeout(timeoutMs) + 2000
                }
            );

            const elapsed = Date.now() - startTime;
            backendLogger.info(`✅ WRITE MULTIPLE SUCCESS: Write multiple completed successfully (${this.connectionId}:${slaveId}:${address} count: ${values.length}) (took ${elapsed}ms)`, "ModbusConnection");

        } catch (err: any) {
            const elapsed = Date.now() - startTime;
            const errorMessage = err.message || String(err);

            // Device busy hatalarını warning olarak logla, diğerlerini error olarak
            if (errorMessage.includes("Modbus exception 6") || errorMessage.includes("Slave device busy")) {
                backendLogger.warning(`❌ WRITE MULTIPLE FAILED: Write multiple failed due to device busy (${this.connectionId}:${slaveId}:${address}): ${errorMessage} (took ${elapsed}ms)`, "ModbusConnection");
            } else {
                backendLogger.error(`❌ WRITE MULTIPLE ERROR: Write multiple error (${this.connectionId}:${slaveId}:${address}): ${errorMessage} (took ${elapsed}ms)`, "ModbusConnection");
            }

            this.handleReadError(err);
            throw err;
        }
    }

    /**
     * Modbus üzerinden tek bir register'a yazar (FC06) - Interface uyumluluğu için
     */
    async writeRegister(address: number, value: number): Promise<any> {
        // Bu metod sadece interface uyumluluğu için, gerçek implementasyon writeHoldingRegisterWithRetry'de
        throw new Error("Use writeHoldingRegisterWithRetry instead of writeRegister");
    }

    /**
     * Modbus üzerinden birden çok register'a yazar (FC16) - Interface uyumluluğu için
     */
    async writeRegisters(address: number, values: number[]): Promise<any> {
        // Bu metod sadece interface uyumluluğu için, gerçek implementasyon writeHoldingRegistersWithRetry'de
        throw new Error("Use writeHoldingRegistersWithRetry instead of writeRegisters");
    }


    /**
     * RTT değerini günceller ve gerekirse concurrency'yi ayarlar
     */
    protected updateRTT(elapsed: number): void {
        // RTT örneğini ekle
        this.rttSamples.push(elapsed);
        
        // Örnek sayısını sınırla
        if (this.rttSamples.length > this.rttSampleSize) {
            this.rttSamples.shift(); // En eski örneği çıkar
        }
        
        // Ortalama RTT'yi hesapla - aykırı değerleri filtrele
        if (this.rttSamples.length >= 3) {
            // İstatistiksel aykırı değerleri filtrele
            const sortedSamples = [...this.rttSamples].sort((a, b) => a - b);
            const q1Index = Math.floor(sortedSamples.length * 0.25);
            const q3Index = Math.floor(sortedSamples.length * 0.75);
            const validSamples = sortedSamples.filter(
                sample => sample >= sortedSamples[q1Index] && sample <= sortedSamples[q3Index]
            );
            
            // Filtrelenmiş örneklerin ortalamasını al
            if (validSamples.length > 0) {
                this.avgRTT = validSamples.reduce((sum, val) => sum + val, 0) / validSamples.length;
            }
        } else if (this.rttSamples.length > 0) {
            // Örnek sayısı az ise basit ortalama
            this.avgRTT = this.rttSamples.reduce((sum, val) => sum + val, 0) / this.rttSamples.length;
        }
        
        // Concurrency güncelleme artık updateConcurrency içinde zaman kontrolü ile yapılıyor
        this.updateConcurrency();
    }

    /**
     * Okuma hatalarını işler
     */
    protected handleReadError(err: any): void {
        // Bağlantı hatalarını alt sınıflar işleyecek
        this.emit('readError', err);
    }

    /**
     * Bağlantının açık olup olmadığını kontrol eder
     */
    isOpen(): boolean {
        return this.isConnected && this.client !== null && (this.client as any).isOpen === true;
    }

    /**
     * Optimal timeout değerini hesaplar
     */
    protected calculateTimeout(configuredTimeout?: number): number {
        // Konfigüre edilmiş bir timeout değeri varsa, bunu kullan
        if (configuredTimeout && configuredTimeout > 0) {
            return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, configuredTimeout));
        }

        // Aksi halde RTT'ye dayalı bir değer hesapla
        // Default 500ms, max 5 saniye
        // RTT varsa, RTT'nin 3 katını kullan (en az 500ms, en fazla 5 saniye)
        if (this.avgRTT > 0) {
            return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, this.avgRTT * 3));
        }

        // RTT yoksa, default timeout değerini kullan
        return 1000;
    }


    /**
     * Cihaz sayısını günceller ve gerekirse queue concurrency değerini yeniden ayarlar
     * @param count Cihaz sayısı
     */
    public updateDeviceCount(count: number): void {
        // Cihaz sayısını güncelle
        if (count !== this.deviceCount) {
            const oldCount = this.deviceCount;
            this.deviceCount = count;
            backendLogger.info(`${this.connectionId} device count: ${oldCount} -> ${count}`, "ModbusConnection");
            
            // Cihaz sayısı sıfır olduğunda kuyruğu temizle ve durdur
            if (count === 0) {
                this.handleZeroDevices();
            } else {
                // Concurrency değerini forceUpdate ile güncelle
                this.updateConcurrency(true);
            }
        }
    }
    
    /**
     * Cihaz sayısı sıfır olduğunda kuyruğu temizler ve durdurur
     */
    private handleZeroDevices(): void {
        if (!this.queue) return;
        
        // Kuyruktaki tüm işleri temizle
        this.queue.clear();
        
        // Concurrency'i minimize et (1'e düşür)
        this.concurrency = 1;
        this.queue.concurrency = 1;
        
        backendLogger.info(`${this.connectionId} has no devices, queue minimized (concurrency=1)`, "ModbusConnection");
    }

    /**
     * Queue'nun concurrency değerini günceller
     * Bu metot, cihaz sayısı değiştiğinde veya performans metriklerinde değişiklik olduğunda çağrılmalıdır
     * @param options Opsiyonel olarak iletilen performans metrikleri
     */
    updateConcurrency(forceUpdate: boolean = false): number {
        const now = Date.now();
        if (!forceUpdate && now - this.lastConcurrencyUpdate < this.concurrencyUpdateInterval) {
            return this.concurrency;
        }

        const avgRtt = this.avgRTT;
        const deviceCount = this.deviceCount;
        
        // RTT aralık tabanlı stabil concurrency hesaplama (Daha Toleranslı)
        let targetConcurrency: number;
        
        if (deviceCount === 0) {
            targetConcurrency = 1;
        } else if (deviceCount <= 4) {
            targetConcurrency = avgRtt > 500 ? 1 : 2;
        } else if (deviceCount <= 8) { // 5 cihaz bu gruba giriyor
            if (avgRtt > 750) targetConcurrency = 2;      // 750ms'den yüksekse 2'ye düşür
            else if (avgRtt > 400) targetConcurrency = 3;  // 400ms'den yüksekse 3'e düşür
            else targetConcurrency = 4;                  // Normalde 4
        } else if (deviceCount <= 16) {
            if (avgRtt > 800) targetConcurrency = 3;
            else if (avgRtt > 500) targetConcurrency = 4;
            else targetConcurrency = 6;
        } else if (deviceCount <= 32) {
            if (avgRtt > 1000) targetConcurrency = 5;
            else if (avgRtt > 600) targetConcurrency = 7;
            else targetConcurrency = 9;
        } else { // 32+ cihaz
            if (avgRtt > 1200) targetConcurrency = 8;
            else if (avgRtt > 800) targetConcurrency = 10;
            else if (avgRtt > 400) targetConcurrency = 12;
            else targetConcurrency = 14;
        }
        
        // Yüksek RTT durumlarında ek azaltma (Daha Az Agresif)
        if (avgRtt > 1500) { // Eşik 1500ms'ye çıkarıldı
            targetConcurrency = Math.max(1, Math.ceil(targetConcurrency * 0.8)); // Azaltma %20'ye düşürüldü
            if (!this.loggedOnce.has(`high_rtt_${this.connectionId}`)) {
                backendLogger.warning(`High RTT detected (${avgRtt.toFixed(1)}ms), reducing concurrency`, "ModbusConnection", { connectionId: this.connectionId });
                this.loggedOnce.add(`high_rtt_${this.connectionId}`);
            }
        } else {
            this.loggedOnce.delete(`high_rtt_${this.connectionId}`);
        }
        
        // AvgRTT loglama - ilk kez veya önemli değişiklik varsa
        if (!this.avgRTTLoggedOnce || (this.lastLoggedAvgRTT > 0 && Math.abs(avgRtt - this.lastLoggedAvgRTT) > 100)) {
            this.lastLoggedAvgRTT = avgRtt;
            this.avgRTTLoggedOnce = true;
        }
        
        const newConcurrency = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, targetConcurrency));

        if (newConcurrency !== this.concurrency) {
            backendLogger.info(`${this.connectionId} concurrency: ${this.concurrency} -> ${newConcurrency} (RTT: ${avgRtt.toFixed(1)}ms, devices: ${deviceCount})`, "ModbusConnection");
            this.concurrency = newConcurrency;
            if (this.queue) {
                this.queue.concurrency = this.concurrency;
            }
            this.lastConcurrencyUpdate = now;
        }
        return this.concurrency;
    }

    /**
     * Kuyruk olaylarını dinler
     */
    setupQueueEvents(): void {
        if (!this.queue) {
            backendLogger.warning(`${this.connectionId} Queue not created yet, cannot bind events`, "ModbusConnection");
            return;
        }
        
        // Önce mevcut listener'ları temizle (mükerrer eklemeyi önle)
        this.queue.removeAllListeners("idle");
        this.queue.removeAllListeners("error");
        
        this.queue.on("idle", () => {
            setTimeout(() => {
                if (this.queue && this.queue.size === 0 && this.queue.pending === 0) {
                    this.queue.clear();
                }
            }, 1000);
        });

        this.queue.on("error", (err: any) => {
            backendLogger.error(`${this.connectionId} queue error: ${err.message}`, "ModbusConnection");
        });
    }
}


/**
 * ModbusTcpConnection sınıfı - TCP bağlantısını yönetir
 */
export class ModbusTcpConnection extends ModbusConnection {
    host: string;
    port: number;

    constructor(host: string, port: number, pooledConnectionId?: string) {
        // Eğer havuzlanmış bir ID varsa onu kullan, yoksa standart ID oluştur.
        super(pooledConnectionId || `${host}:${port}`);
        this.host = host;
        this.port = port;
    }

    /**
     * TCP bağlantısı kurar
     */
    async connect(): Promise<void> {
        if (this.isConnected && this.client) {
            return;
        }

        // Kademeli bekleme süresi
        if (this.retryCount > 0) {
            const delay = Math.min(
                EXPONENTIAL_BACKOFF_BASE * Math.pow(2, this.retryCount - 1),
                300_000 // en fazla 5 dk bekle
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            this.client = new ModbusRTU();
            await this.client.connectTCP(this.host, { port: this.port });

            // Soketi yapılandır
            if (this.client._port && this.client._port.socket) {
                const socket = this.client._port.socket;
                socket.setKeepAlive(true, 15000);
                socket.setNoDelay(true);

                // Güvenli socket listener ekleme
                this.safeAddSocketListener('error', (...args: unknown[]) => {
                    const err = args[0] as Error;
                    backendLogger.error(`${this.connectionId} socket error: ${err.message}`, "ModbusConnection");
                    this.handleConnectionLoss();
                });

                this.safeAddSocketListener('close', () => {
                    backendLogger.warning(`${this.connectionId} socket closed`, "ModbusConnection");
                    this.handleConnectionLoss();
                });

                this.safeAddSocketListener('timeout', () => {
                    backendLogger.warning(`${this.connectionId} socket timeout`, "ModbusConnection");
                    socket.destroy();
                    this.handleConnectionLoss();
                });
            }

            if (this.client._port) {
                // Güvenli port listener ekleme
                this.safeAddListener('error', (...args: unknown[]) => {
                    const err = args[0] as Error;
                    backendLogger.error(`[TCP] ${this.connectionId} port error: ${err.message}`, "ModbusConnection");
                    this.handleConnectionLoss();
                });
            }

            backendLogger.debug(`Device count: ${this.deviceCount}`, "ModbusConnection");
            // Queue oluştur - dinamik concurrency ile
            const concurrency = this.updateConcurrency(true); // Başlangıçta zorla güncelle
            
            // Eğer cihaz sayısı sıfır ise ve eski kuyruk varsa, yenisini oluşturma
            if (this.deviceCount === 0 && this.queue) {
                backendLogger.info(`${this.connectionId} has no devices, keeping minimal queue`, "ModbusConnection");
                // Mevcut kuyruğu minimum ayarla
                this.concurrency = 1;
                this.queue.concurrency = 1;
            } else {
                // Normal durumda yeni kuyruk oluştur
                this.queue = new PQueue({
                    concurrency: concurrency,
                    autoStart: true,
                    throwOnTimeout: true,
                    carryoverConcurrencyCount: true
                });
            }
            
            // Kuyruk olaylarını dinle
            this.setupQueueEvents();
            
            backendLogger.info(`Queue created with concurrency: ${concurrency} for connection ${this.connectionId}`, "ModbusConnection");
            
            this.isConnected = true;
            this.retryCount = 0;
            backendLogger.info(`Connected ${this.connectionId} (keepAlive enabled)`, "ModbusConnection");
            this.emit('connected');
        } catch (err: any) {
            this.retryCount++;
            backendLogger.error(`Connection failed for ${this.connectionId}: ${err.message}`, "ModbusConnection");

            // Bağlantı kaybı sinyalini gönder
            this.emit('connectionLost');
            
            // PollingEngine'den kontrolü geri alıyoruz. Yeniden bağlanmayı kendimiz tetikleyeceğiz.
            // this.scheduleReconnect(); // ARTIK POLLING ENGINE KONTROL EDECEK
            throw err;
        }
    }

    /**
     * Bağlantı kaybı durumunda yeniden bağlanmayı zamanlar
     */
    protected handleConnectionLoss(): void {
        if (this.isShuttingDown) {
            backendLogger.debug(`Connection ${this.connectionId} is shutting down, ignoring connectionLost event.`, "ModbusConnection");
            return;
        }
        if (!this.isConnected || this.connectionLostEmitted) return;

        this.isConnected = false;
        this.connectionLostEmitted = true; // Olayın yayınlandığını işaretle
        this.close();
        this.emit('connectionLost');
        
        // Yeniden bağlanma kararını ve zamanlamasını tekrar kendimiz yönetiyoruz.
        // this.scheduleReconnect(); // ARTIK POLLING ENGINE KONTROL EDECEK
    }

    /**
     * Yeniden bağlanma (Artık PollingEngine tarafından yönetiliyor)
     * Public olarak tanımlandı, böylece PollingEngine çağırabilir.
     * Bu metodun kendisi artık zamanlama yapmıyor, sadece `connect` metodunu çağırıyor.
     */
    public async attemptReconnect(): Promise<void> {
        if (this.isConnected) {
            return;
        }

        // Yeniden bağlanma denemesi için flag'leri sıfırla
        this.isShuttingDown = false;
        this.connectionLostEmitted = false;
        
        backendLogger.info(`Attempting to reconnect ${this.connectionId} (attempt ${this.retryCount + 1})`, "ModbusConnection");
        try {
            await this.connect();
        } catch {
            // Hata zaten connect içinde ele alınıyor ve connectionLost yayılıyor.
            // O yüzden burada ek bir şeye gerek yok.
        }
    }
    
    /**
     * Okuma hatalarını işler
     */
    protected handleReadError(err: any): void {
        super.handleReadError(err);

        // TCP seviyesinde gerçekten kopma mı var?
        const MAX_TIMEOUT_STRIKES = 5; // Eşik değeri
        const isTimeoutError = err.message.includes("timed out") || err.name === 'TimeoutError';

        // Gerçek bir TCP bağlantı hatası ise hemen yeniden başlat
        const isTcpError =
            err.message.includes("Port Not Open") ||
            err.code === "ECONNRESET" ||
            err.code === "EHOSTUNREACH" ||
            err.code === "ENETUNREACH";

        if (isTcpError) {
            backendLogger.warning(`${this.connectionId} connection lost due to TCP error (${err.message}), forcing reconnect…`, "ModbusConnection");
            this.handleConnectionLoss();
            return;
        }

        // Eğer hata bir timeout ise, sayaç mekanizmasını uygula
        if (isTimeoutError) {
            this.timeoutStrikes++;
            backendLogger.warning(`${this.connectionId} request timed out. Strike ${this.timeoutStrikes}/${MAX_TIMEOUT_STRIKES}.`, "ModbusConnection");

            if (this.timeoutStrikes >= MAX_TIMEOUT_STRIKES) {
                backendLogger.error(`${this.connectionId} has reached max timeout strikes. Assuming connection is unhealthy and forcing reconnect.`, "ModbusConnection");
                this.handleConnectionLoss();
                this.timeoutStrikes = 0; // Döngüyü sıfırla
            }
        }
    }

}