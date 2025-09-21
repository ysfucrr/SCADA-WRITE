// src/lib/modbus/PollingEngine.ts
// This class encapsulates the core polling logic, 
// which will eventually run within a worker thread.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "events";
import { AnalyzerSettings } from "./AnalyzerSettings";
import { Register } from "./Register";
import { PollerBlock } from "./PollerBlock";
import { ModbusConnection, ModbusTcpConnection } from "./ModbusConnection";
import { PollerBlockFactory } from "./PollerBlockFactory";
import { backendLogger } from "../logger/BackendLogger";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ANALYZERS_PER_CONNECTION = 5; // Her 5 analizör için yeni bir paralel bağlantı aç
const MAX_CONNECTIONS_PER_GATEWAY = 10; // Bir gateway için açılabilecek maksimum paralel bağlantı (Kullanıcı isteği üzerine 10'a yükseltildi)

declare module "./ModbusConnection" {
  interface ModbusConnection {
    attemptReconnect(): Promise<void>;
  }
}

export class PollingEngine extends EventEmitter {
    private analyzers: Map<string, AnalyzerSettings> = new Map();
    private registers: Map<string, Register> = new Map();
    private blocks: Map<string, PollerBlock[]> = new Map();
    private connections: Map<string, ModbusConnection> = new Map(); // Key: pooledConnectionId (ip:port:index)
    private isShuttingDown: boolean = false;
    private pendingConnections: Map<string, Promise<ModbusConnection | null>> = new Map();
    private pendingDeviceCounts: Map<string, number> = new Map(); // Gateway ID -> deviceCount
    // nextBlockIndex'e ek olarak pollVersion'ı da ekleyerek yarış durumlarını yönetiyoruz.
    private analyzerPollState: Map<string, { nextBlockIndex: number; pollVersion: number }> = new Map();
    private analyzerToConnectionIndex: Map<string, number> = new Map(); // Hangi analizörün hangi havuz indexini kullanacağı
    // Aktif zamanlayıcıları (timer) yönetmek için bir map.
    private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
    private reconnectTimers: Map<string, NodeJS.Timeout> = new Map(); // Gateway ID -> Timer
    private reconnectingConnections: Set<string> = new Set(); // Yeniden bağlanma sürecindeki bağlantılar
    private connectionMismatchLogged: Set<string> = new Set(); // Connection mismatch loglarını takip etmek için

    constructor() {
        super();
    }
    
    // "Eager Reconnect" logic: always try to reconnect if there are registers configured.
    private checkActiveRegistersForConnection(connectionId: string): boolean {
        // Spesifik paralel bağlantı için register kontrolü yap
        for (const analyzer of this.analyzers.values()) {
            // Bu analizörün kullandığı spesifik bağlantı ID'sini hesapla
            const analyzerConnectionIndex = this.analyzerToConnectionIndex.get(analyzer.id) || 0;
            const analyzerConnectionId = `${analyzer.getConnectionId()}:${analyzerConnectionIndex}`;
            
            // Eğer bu analizör kopan bağlantıyı kullanıyorsa
            if (analyzerConnectionId === connectionId) {
                // Bu analizörün aktif register'ı var mı kontrol et
                for (const register of this.registers.values()) {
                    if (register.analyzerId === analyzer.id) {
                        return true; // Aktif register bulundu, yeniden bağlanma gerekli.
                    }
                }
            }
        }
        return false; // Bu spesifik bağlantı için aktif register bulunamadı.
    }

    private setupConnectionListeners(connection: ModbusConnection): void {
        const connectionId = connection.connectionId;
    
        connection.on('connectionLost', () => {
            const gatewayId = connectionId.split(':').slice(0, 2).join(':');
            const connectionIndex = parseInt(connectionId.split(':')[2] || '0');
            
            // Sadece index:0 bağlantısından alert event'i yayınla (çift event önleme)
            if (connectionIndex === 0) {
                // Gateway ID'yi gateway ObjectId olarak bul
                const analyzer = Array.from(this.analyzers.values()).find(a => a.getConnectionId() === gatewayId);
                const gatewayIdWithAnalyzer = analyzer?.gatewayId || gatewayId;
                
                //backendLogger.info(`[ALERT-EVENT] Gateway ${gatewayIdWithAnalyzer} disconnected (from ${connectionId})`, "PollingEngine");
                this.emit('connectionStatusChanged', { gatewayId: gatewayIdWithAnalyzer, status: 'disconnected', connectionId });
            }
    
            // Connection mismatch cache'ini temizle
            const keysToDelete = Array.from(this.connectionMismatchLogged).filter(key => key.includes(connectionId));
            keysToDelete.forEach(key => this.connectionMismatchLogged.delete(key));
            if (keysToDelete.length > 0) {
                backendLogger.debug(`Cleared ${keysToDelete.length} connection mismatch cache entries for ${connectionId}`, "PollingEngine");
            }
    
            // DÜZELTME: Connection kaybında tüm ilgili polling timer'larını kesinlikle durdur
            let stoppedTimers = 0;
            this.analyzers.forEach(analyzer => {
                const pooledConnId = `${analyzer.getConnectionId()}:${this.analyzerToConnectionIndex.get(analyzer.id) || 0}`;
                if (pooledConnId === connectionId) {
                    const timer = this.pollingTimers.get(analyzer.id);
                    if (timer) {
                        clearTimeout(timer);
                        this.pollingTimers.delete(analyzer.id);
                        stoppedTimers++;
                        backendLogger.debug(`Polling loop for analyzer ${analyzer.name} stopped due to connection loss.`, "PollingEngine");
                    }
                }
            });
            
            if (stoppedTimers > 0) {
                backendLogger.info(`Stopped ${stoppedTimers} polling timer(s) due to connection ${connectionId} loss.`, "PollingEngine");
            }
    
            // Eski reconnect timer'ını temizle
            if (this.reconnectTimers.has(connectionId)) {
                clearTimeout(this.reconnectTimers.get(connectionId)!);
                this.reconnectTimers.delete(connectionId);
            }
    
            if (this.checkActiveRegistersForConnection(connectionId)) {
                backendLogger.info(`Active registers found for ${connectionId}. Scheduling reconnect attempt in 60s.`, "PollingEngine");
                this.reconnectingConnections.add(connectionId); // Süreci başlat
                
                const timer = setTimeout(() => {
                    this.reconnectTimers.delete(connectionId);
                    this.reconnectingConnections.delete(connectionId); // Deneme öncesi kaldır
                    connection.retryCount = 0;
                    connection.attemptReconnect();
                }, 60000);
    
                this.reconnectTimers.set(connectionId, timer);
            } else {
                backendLogger.info(`No active registers for ${connectionId}. Reconnect will not be scheduled.`, "PollingEngine");
            }
        });
        
        connection.on('connected', () => {
            const gatewayId = connectionId.split(':').slice(0, 2).join(':');
            const connectionIndex = parseInt(connectionId.split(':')[2] || '0');
            
            // Sadece index:0 bağlantısından alert event'i yayınla (çift event önleme)
            if (connectionIndex === 0) {
                // Gateway ID'yi gateway ObjectId olarak bul
                const analyzer = Array.from(this.analyzers.values()).find(a => a.getConnectionId() === gatewayId);
                const gatewayIdWithAnalyzer = analyzer?.gatewayId || gatewayId;
                
                //backendLogger.info(`[ALERT-EVENT] Gateway ${gatewayIdWithAnalyzer} connected (from ${connectionId})`, "PollingEngine");
                this.emit('connectionStatusChanged', { gatewayId: gatewayIdWithAnalyzer, status: 'connected', connectionId });
            }
    
            // Bağlantı kurulduğunda, yeniden bağlanma sürecinde olmadığını belirt
            this.reconnectingConnections.delete(connectionId);

            // Connection mismatch cache'ini temizle (yeni bağlantı için)
            const keysToDelete = Array.from(this.connectionMismatchLogged).filter(key => key.includes(connectionId));
            keysToDelete.forEach(key => this.connectionMismatchLogged.delete(key));

            if (this.reconnectTimers.has(connectionId)) {
                clearTimeout(this.reconnectTimers.get(connectionId)!);
                this.reconnectTimers.delete(connectionId);
                backendLogger.info(`Connection re-established for ${connectionId}, canceling scheduled reconnect.`, "PollingEngine");
            }
            
            const affectedAnalyzers = Array.from(this.analyzers.values()).filter(a => connectionId.startsWith(a.getConnectionId()));
            this.resetMissCountersForConnection(connectionId);
            affectedAnalyzers.forEach((analyzer) => {
                 this.startPolling(analyzer);
            });
        });
    }

    private resetMissCountersForConnection(connectionId: string): void {
        this.analyzers.forEach(analyzer => {
            if (analyzer.getConnectionId() === connectionId) {
                const blocks = this.blocks.get(analyzer.id) || [];
                blocks.forEach(block => block.registers.forEach(register => register.resetMiss()));
            }
        });
    }

    public async initialize(analyzers: any[], registers: any[]): Promise<void> {
        backendLogger.info(`Initializing with ${analyzers.length} analyzers and ${registers.length} registers`, "PollingEngine");

        const newAnalyzersMap = new Map<string, AnalyzerSettings>();
        analyzers.forEach(config => newAnalyzersMap.set(config.id, new AnalyzerSettings(config)));
        this.analyzers = newAnalyzersMap;

        const newRegistersMap = new Map<string, Register>();
        registers.forEach(doc => newRegistersMap.set(doc.id, new Register(doc)));
        this.registers = newRegistersMap;

        // --- Sadece "Aktif" (register'ı olan) analizörleri hesaba kat ---
        const activeAnalyzerIds = new Set<string>();
        this.registers.forEach(reg => activeAnalyzerIds.add(reg.analyzerId));
        backendLogger.info(`Found ${activeAnalyzerIds.size} active analyzers with registers.`, "PollingEngine");

        // Düzeltme: Paralel bağlantı havuzu, aktif register'ı olan değil, TÜM analizörlerin sayısına göre belirlenmelidir.
        const allAnalyzers = Array.from(this.analyzers.values());

        // --- Analizörleri Gateway'lere ve Bağlantı Havuzlarına Dağıt ---
        const analyzersByGateway = new Map<string, AnalyzerSettings[]>();
        allAnalyzers.forEach(analyzer => {
            const gatewayId = analyzer.getConnectionId();
            if (!analyzersByGateway.has(gatewayId)) {
                analyzersByGateway.set(gatewayId, []);
            }
            analyzersByGateway.get(gatewayId)!.push(analyzer);
        });

        this.analyzerToConnectionIndex.clear();
        analyzersByGateway.forEach((gatewayAnalyzers) => {
            const connectionCount = Math.min(
                MAX_CONNECTIONS_PER_GATEWAY,
                Math.ceil(gatewayAnalyzers.length / ANALYZERS_PER_CONNECTION)
            );

            backendLogger.info(`Gateway ${gatewayAnalyzers[0].getConnectionId()}: Found ${gatewayAnalyzers.length} analyzers. Decided on a pool of ${connectionCount} parallel connection(s).`, "PollingEngine");
            
            // Analizörleri ID'ye göre sırala (sabit dağıtım için)
            const sortedAnalyzers = [...gatewayAnalyzers].sort((a, b) => a.id.localeCompare(b.id));
            
            // Özet atama bilgisi
            const connectionAssignments = new Map<number, number>();
            
            sortedAnalyzers.forEach((analyzer, index) => {
                const connectionIndex = Math.floor(index / ANALYZERS_PER_CONNECTION);
                this.analyzerToConnectionIndex.set(analyzer.id, connectionIndex);
                connectionAssignments.set(connectionIndex, (connectionAssignments.get(connectionIndex) || 0) + 1);
            });
            
            // Özet log - her connection index için kaç analizör atandığını göster
            const assignmentSummary = Array.from(connectionAssignments.entries())
                .map(([index, count]) => `index:${index}(${count})`)
                .join(', ');
            backendLogger.info(`  Analyzer assignment: ${assignmentSummary}`, "PollingEngine");
        });
        
        this.createBlocksForAnalyzers();
        this.analyzers.forEach(analyzer => this.startPolling(analyzer));

        // Edge Case: Eğer başlangıçta hiç aktif register yoksa, tüm gateway'ler için
        // pending device count'u 0 olarak ayarla.
        if (activeAnalyzerIds.size === 0) {
            const allGatewayIds = new Set(Array.from(this.analyzers.values()).map(a => a.getConnectionId()));
            allGatewayIds.forEach(gatewayId => {
                backendLogger.info(`Gateway ${gatewayId} has no active registers on startup. Storing pending device count: 0`, "PollingEngine");
                this.pendingDeviceCounts.set(gatewayId, 0);
            });
        }
    }

    public async clearConfiguration(newAnalyzers: any[] = []): Promise<void> {
        //backendLogger.info("Starting configuration clear...", "PollingEngine");
    
        // Yeni konfigürasyonda hala gerekli olacak bağlantı ID'lerini bir set'te topla
        const newConnectionIds = new Set<string>();
        if (newAnalyzers.length > 0) {
            const tempAnalyzers = new Map<string, AnalyzerSettings>();
            newAnalyzers.forEach(config => tempAnalyzers.set(config.id, new AnalyzerSettings(config)));
    
            const connectionPools = new Map<string, number>();
            const analyzersByGateway = new Map<string, any[]>();
    
            newAnalyzers.forEach(analyzer => {
                const gatewayId = tempAnalyzers.get(analyzer.id)!.getConnectionId();
                if (!analyzersByGateway.has(gatewayId)) {
                    analyzersByGateway.set(gatewayId, []);
                }
                analyzersByGateway.get(gatewayId)!.push(analyzer);
            });
    
            analyzersByGateway.forEach((gatewayAnalyzers, gatewayId) => {
                const connectionCount = Math.min(
                    MAX_CONNECTIONS_PER_GATEWAY,
                    Math.ceil(gatewayAnalyzers.length / ANALYZERS_PER_CONNECTION)
                );
                for (let i = 0; i < connectionCount; i++) {
                    newConnectionIds.add(`${gatewayId}:${i}`);
                }
            });
        }
    
        // 1. ÖNCELİKLE TÜM POLLING TIMER'LARINI DURDUR - Bu en kritik adım!
        //backendLogger.debug(`Stopping ${this.pollingTimers.size} active polling timers...`, "PollingEngine");
        this.pollingTimers.forEach((timer, analyzerId) => {
            clearTimeout(timer); // DÜZELTME: clearInterval değil clearTimeout!
            //backendLogger.debug(`Stopped polling timer for analyzer ${analyzerId}`, "PollingEngine");
        });
        this.pollingTimers.clear();
        
        // 2. Tüm reconnect timer'larını da durdur
        this.reconnectTimers.forEach((timer, connectionId) => {
            clearTimeout(timer);
            backendLogger.debug(`Stopped reconnect timer for connection ${connectionId}`, "PollingEngine");
        });
        this.reconnectTimers.clear();
        this.reconnectingConnections.clear();
    
        // 3. Bekleyen tüm bağlantı denemelerini temizle
        this.pendingConnections.clear();
    
        // 4. Yeni konfigürasyonda hala gerekli olacak bağlantı ID'lerini hesapla
        const closePromises = Array.from(this.connections.entries()).map(([connId, conn]) => {
            if (!newConnectionIds.has(connId)) {
                backendLogger.info(`Connection ${connId} no longer needed in new config. Closing.`, "PollingEngine");
                conn.isShuttingDown = true;
                
                // Kapatılan connection'ı kullanan tüm analizörlerin polling timer'larını durdur
                // Kapatılan connection'ı kullanan tüm analizörlerin polling timer'larını durdur
                this.analyzers.forEach(analyzer => {
                    const analyzerConnectionId = `${analyzer.getConnectionId()}:${this.analyzerToConnectionIndex.get(analyzer.id) || 0}`;
                    if (analyzerConnectionId === connId) {
                        const timer = this.pollingTimers.get(analyzer.id);
                        if (timer) {
                            clearTimeout(timer);
                            this.pollingTimers.delete(analyzer.id);
                            //backendLogger.debug(`Stopped polling timer for analyzer ${analyzer.name} due to connection ${connId} closure.`, "PollingEngine");
                        }
                    }
                });
                
                // --- KONTROLLÜ KAPATMA (GRACEFUL SHUTDOWN) ---
                //backendLogger.debug(`[Graceful Shutdown] Starting for connection: ${connId}.`, "PollingEngine");
                conn.isShuttingDown = true;

                // 1. ADIM: İşlem kuyruğunu duraklat ve bekleyen tüm görevleri temizle.
                // Bu, kapatılmakta olan bir bağlantıya yeni istek gönderilmesini engeller.
                if (conn.queue) {
                    const qSize = conn.queue.size;
                    const qPending = conn.queue.pending;
                    // Kuyruğun tüm bekleyen görevleri tamamlamasını beklemeden önce durdur ve temizle.
                    conn.queue.pause();
                    conn.queue.clear();
                    //backendLogger.debug(`[Graceful Shutdown] Paused and cleared queue for ${connId}. (Was size: ${qSize}, pending: ${qPending})`, "PollingEngine");
                }
                
                // 2. ADIM: Kuyruk temizlendikten SONRA bağlantıyı kapat.
                conn.close();
                this.connections.delete(connId); // Haritadan hemen kaldır
                //backendLogger.info(`[Graceful Shutdown] Connection ${connId} successfully closed and removed.`, "PollingEngine");
            }
        });
        await Promise.allSettled(closePromises);
    
        // 5. Korunan bağlantıların queue'larını da temizle (concurrency değişimi için)
        const clearedConnections: string[] = [];
        this.connections.forEach((connection, pooledConnectionId) => {
            if (newConnectionIds.has(pooledConnectionId) && connection.queue) {
                const qSize = connection.queue.size;
                const qPending = connection.queue.pending;
                if (qSize > 0 || qPending > 0) {
                    connection.queue.pause();
                    connection.queue.clear();
                    connection.queue.start(); // Hemen yeniden başlat
                    clearedConnections.push(pooledConnectionId);
                    backendLogger.debug(`Cleared queue for preserved connection ${pooledConnectionId}. (Was size: ${qSize}, pending: ${qPending})`, "PollingEngine");
                }
            }
        });
        
        // Queue temizleme sonrası kısa stabilizasyon süresi
        if (clearedConnections.length > 0) {
            await sleep(100); // 100ms stabilizasyon
            backendLogger.debug(`Queue stabilization completed for ${clearedConnections.length} connection(s)`, "PollingEngine");
        }
    
        // 6. Tüm durumları temizle
        this.analyzers.clear();
        this.registers.clear();
        this.blocks.clear();
        this.analyzerPollState.clear();
        this.analyzerToConnectionIndex.clear();
        this.connectionMismatchLogged.clear(); // Connection mismatch log cache'ini de temizle
    
        //backendLogger.info("Configuration has been cleared, keeping necessary connections alive.", "PollingEngine");
    }
    
    private async startPolling(analyzer: AnalyzerSettings): Promise<void> {
        if (!analyzer || this.isShuttingDown) return;

        // Önceki polling döngüsünü durdur.
        const oldTimer = this.pollingTimers.get(analyzer.id);
        if (oldTimer) {
            clearTimeout(oldTimer);
            this.pollingTimers.delete(analyzer.id);
        }

        // Eğer analizöre bağlı hiç register yoksa (ne read ne write), hiçbir şey yapma.
        if (!this.hasRegisters(analyzer.id)) {
            //backendLogger.debug(`Analyzer ${analyzer.name} has no registers at all, skipping polling and connection.`, "PollingEngine");
            return;
        }

        // --- EN KRİTİK DEĞİŞİKLİK ---
        // Okunacak blok olmasa bile (sadece write register'ları olabilir),
        // bağlantının kurulduğundan emin olmalıyız.
        const connection = await this.ensureConnection(analyzer);
        if (!connection) {
            backendLogger.warning(`Connection for ${analyzer.name} could not be established. Handing over to ModbusConnection's backoff mechanism.`, "PollingEngine");
            return;
        }
        analyzer.connection = connection; // Referansı ata

        // Sadece okunacak bloklar varsa polling döngüsünü başlat.
        const blocks = this.getBlocksForAnalyzer(analyzer.id);
        if (!blocks || blocks.length === 0) {
            backendLogger.debug(`No readable blocks for analyzer ${analyzer.name}. Connection is ensured, but polling loop will not start.`, "PollingEngine");
            return; // Polling döngüsünü başlatmadan çık.
        }

        // Analizörün polling state'ini al veya oluştur.
        let pollState = this.analyzerPollState.get(analyzer.id);
        if (!pollState) {
            pollState = { nextBlockIndex: 0, pollVersion: 0 };
        }
        // Versiyonu artırarak eski döngülerin sonlanmasını tetikle.
        pollState.pollVersion = (pollState.pollVersion || 0) + 1;
        const currentVersion = pollState.pollVersion;
        this.analyzerPollState.set(analyzer.id, pollState);

        //backendLogger.debug(`Started polling for analyzer ${analyzer.name} with connection ${connection.connectionId}`, "PollingEngine");

        const totalPollMs = Math.max(analyzer.pollMs || 1000, 500);
        const intervalMs = Math.max(50, totalPollMs / blocks.length);

        const pollLoop = async () => {
            const currentState = this.analyzerPollState.get(analyzer.id);
            if (!currentState || currentState.pollVersion !== currentVersion) {
                return; // Bu eski bir döngü, kendini sonlandır.
            }

            // İYİLEŞTİRME: Bu döngünün elindeki bağlantı referansının hala geçerli olduğunu doğrula.
            // Bir konfigürasyon değişikliği sırasında bu referans geçersiz kalabilir.
            const expectedConnectionId = `${analyzer.getConnectionId()}:${this.analyzerToConnectionIndex.get(analyzer.id) || 0}`;
            if (!this.connections.has(expectedConnectionId) || this.connections.get(expectedConnectionId) !== connection) {
                backendLogger.warning(`Stale pollLoop detected for analyzer ${analyzer.name}. Expected connection ${expectedConnectionId} is no longer valid. Terminating loop.`, "PollingEngine");
                return; // Bu döngüyü sonlandır, startPolling yeniden başlatacaktır.
            }

            // İYİLEŞTİRME: Bağlantı, merkezi olarak yeniden bağlanma sürecindeyse,
            // bu döngü sessizce beklesin ve log spam'i yapmasın.
            if (this.reconnectingConnections.has(connection.connectionId)) {
                backendLogger.debug(`Connection ${connection.connectionId} is in reconnect procedure. Analyzer ${analyzer.name} poll loop is pausing for 60s.`, "PollingEngine");
                const timer = setTimeout(pollLoop, 60000); // Daha uzun bir bekleme süresi
                this.pollingTimers.set(analyzer.id, timer);
                return;
            }

            try {
                await this.pollNextBlockForAnalyzer(analyzer, connection, currentVersion);
                const timer = setTimeout(pollLoop, intervalMs);
                this.pollingTimers.set(analyzer.id, timer);
            } catch (err: any) {
                if (err.message.includes('VERSION_MISMATCH') || err.message.includes('Read operation cancelled during shutdown')) {
                    // Bu hatalar, döngünün temiz bir şekilde sonlanması gerektiğini gösterir.
                    // Uyarı log'u veya geri çekilme (backoff) olmadan sessizce çık.
                    return;
                }
                
                backendLogger.warning(`Polling error for ${analyzer.name}: ${err.message}. Backing off for 5s.`, "PollingEngine");
                const timer = setTimeout(pollLoop, 5000);
                this.pollingTimers.set(analyzer.id, timer);
            }
        };
        
        // Yeni polling döngüsünü başlat.
        const initialTimer = setTimeout(pollLoop, intervalMs);
        this.pollingTimers.set(analyzer.id, initialTimer);
    }
    
    private async pollNextBlockForAnalyzer(analyzer: AnalyzerSettings, connection: ModbusConnection, version: number): Promise<void> {
        const currentState = this.analyzerPollState.get(analyzer.id);
        if (!currentState || currentState.pollVersion !== version) {
             throw new Error('VERSION_MISMATCH');
        }

        // Eğer bu analizör için artık register kalmamışsa, polling döngüsünü tamamen durdur.
        if (!this.hasRegisters(analyzer.id)) {
            //backendLogger.info(`No more registers for analyzer ${analyzer.id}, stopping its poll loop.`, "PollingEngine");
            const timer = this.pollingTimers.get(analyzer.id);
            if (timer) {
                clearTimeout(timer);
                this.pollingTimers.delete(analyzer.id);
            }
            // Bu,VERSION_MISMATCH fırlatarak üst döngünün de sonlanmasını sağlar.
            throw new Error('VERSION_MISMATCH');
        }

        // KONTROLLÜ KAPATMA KORUMASI: Bağlantı kapatılma sürecindeyse, daha fazla okuma deneme.
        if (connection.isShuttingDown) {
            backendLogger.debug(`Polling for analyzer ${analyzer.name} skipped as connection ${connection.connectionId} is shutting down.`, "PollingEngine");
            // Bu döngünün sessizce sonlanması için bir versiyon hatası fırlatıyoruz.
            throw new Error('VERSION_MISMATCH');
        }
        
        // DÜZELTME: Connection'ın gerçekten mevcut ve açık olduğunu kontrol et
        const expectedConnectionId = `${analyzer.getConnectionId()}:${this.analyzerToConnectionIndex.get(analyzer.id) || 0}`;
        const actualConnection = this.connections.get(expectedConnectionId);
        
        if (!actualConnection || !actualConnection.isConnected) {
            // Connection artık mevcut değil veya kapalı
            throw new Error(`Connection ${expectedConnectionId} is not open.`);
        }
        
        // Eğer verilen connection ile beklenen connection farklıysa, güncel olanı kullan
        if (connection.connectionId !== expectedConnectionId) {
            const mismatchKey = `${analyzer.id}:${connection.connectionId}:${expectedConnectionId}`;
            if (!this.connectionMismatchLogged.has(mismatchKey)) {
                backendLogger.info(`Connection mismatch detected for analyzer ${analyzer.name}. Expected: ${expectedConnectionId}, Got: ${connection.connectionId}. Updating to current connection.`, "PollingEngine");
                this.connectionMismatchLogged.add(mismatchKey);
            }
            connection = actualConnection;
            // DÜZELTME: Analyzer'ın connection referansını da güncelle
            analyzer.connection = actualConnection;
            // Bu döngü, bir sonraki okumada güncellenmiş bağlantıyı kullanacaktır.
        }

        const blocks = this.getBlocksForAnalyzer(analyzer.id);
        if (blocks.length === 0) return;

        // Döngüsel olarak sıradaki bloğu seç.
        const blockIndex = currentState.nextBlockIndex % blocks.length;
        const block = blocks[blockIndex];
        currentState.nextBlockIndex = (blockIndex + 1) % blocks.length;
    
        if (!block || block.shouldSkip()) {
            return;
        }
    
        try {
            const words = await connection.readHoldingRegisters(analyzer.slaveId, block.start, block.qty, analyzer.timeoutMs);
            block.decodeRegisters(words);
            block.registers.forEach(register => {
                const value = register.getValue();
                if (value !== null && value !== undefined) {
                    const eventData = { id: register.id, analyzerId: analyzer.id, addr: register.addr, value, lastUpdated: Date.now(), dataType: register.dataType, bit: register.bit };
                    this.emit('registerUpdated', eventData);
                }
            });
            // Başarılı okumadan sonra kısa bir bekleme, cihazı boğmamak için
            await sleep(50);
        } catch (err: unknown) {
            block.incrementMissForAll();
            // Hata yukarıdaki pollLoop'a iletilecek ve "geri çekilme" tetiklenecek.
            throw err;
        }
    }

    private async ensureConnection(analyzer: AnalyzerSettings): Promise<ModbusConnection | null> {
        const gatewayId = analyzer.getConnectionId();
        const connectionIndex = this.analyzerToConnectionIndex.get(analyzer.id) || 0;
        const pooledConnectionId = `${gatewayId}:${connectionIndex}`;

        if (this.connections.has(pooledConnectionId)) return this.connections.get(pooledConnectionId)!;
        if (this.pendingConnections.has(pooledConnectionId)) return this.pendingConnections.get(pooledConnectionId)!;

        const connectionPromise = new Promise<ModbusConnection | null>(async (resolve) => {
            try {
                let connection: ModbusConnection;
                if (analyzer.connType === 'tcp') {
                    // Benzersiz havuz ID'sini constructor'a yolla
                    connection = new ModbusTcpConnection(String(analyzer.ip), Number(analyzer.port), pooledConnectionId);
                } else {
                    // Serial bağlantılar artık SerialPoller tarafından yönetiliyor
                    backendLogger.warning(`Serial analyzer ${analyzer.id} should not be processed by PollingEngine`, "PollingEngine");
                    resolve(null); return;
                }

                this.setupConnectionListeners(connection);

                // HATALI YER: Buradaki lokal ve basit sayım mantığını kaldırıyoruz.
                // Cihaz sayısı artık sadece merkezi `updateAllConnectionDeviceCounts` fonksiyonu ile yönetilecek.
                // DÜZELTME: Bağlantıyı kurmadan ÖNCE cihaz sayısını hesapla ve ata.
                // Bu, logların doğru sırada görünmesini ve `connect` metodunun
                // en başından doğru `concurrency` değeriyle çalışmasını sağlar.
                // YENİ DÜZELTME: Cihaz sayısını hesapla ve BAĞLANTIYI DENEMEDEN ÖNCE ata.
                // Bu, logların doğru sırada görünmesini ve `connect` metodunun
                // en başından doğru `concurrency` değeriyle çalışmasını sağlar.
                
                // Her zaman spesifik bağlantı için doğru cihaz sayısını hesapla
                const deviceCountForThisConnection = this.countDevicesForPooledConnection(pooledConnectionId);
                connection.updateDeviceCount(deviceCountForThisConnection);
                
                // Pending count'u temizle (artık kullanılmıyor)
                this.pendingDeviceCounts.delete(gatewayId);

                await connection.connect();
                this.connections.set(pooledConnectionId, connection);
                
                // Bu alt bağlantıyı kullanacak tüm analizörlere bu bağlantı nesnesini ata
                this.analyzers.forEach((an) => {
                    if (an.getConnectionId() === gatewayId && (this.analyzerToConnectionIndex.get(an.id) || 0) === connectionIndex) {
                        an.connection = connection;
                    }
                });

                resolve(connection);
            } catch (err: unknown) {
                if (err instanceof Error) {
                    backendLogger.error(`Failed to establish connection for ${pooledConnectionId}: ${err.message}`, "PollingEngine");
                }
                resolve(null);
            } finally {
                this.pendingConnections.delete(pooledConnectionId);
            }
        });

        this.pendingConnections.set(pooledConnectionId, connectionPromise);
        return connectionPromise;
    }
    
    public createBlocksForAnalyzers(): void {
        this.analyzers.forEach((_, analyzerId) => {
            this.createBlocksForAnalyzer(analyzerId);
        });
        this.updateAllConnectionDeviceCounts();
    }

    public updateSpecificAnalyzer(analyzerId: string, newRegisters: Register[]): void {
        Array.from(this.registers.keys()).forEach(key => {
            if (this.registers.get(key)!.analyzerId === analyzerId) {
                this.registers.delete(key);
            }
        });

        newRegisters.forEach(reg => {
            this.registers.set(reg.id, new Register(reg));
        });

        this.createBlocksForAnalyzer(analyzerId);
        
        // DÜZELTME: Cihaz sayılarını bu değişiklikten hemen sonra merkezi fonksiyonla yeniden hesapla.
        this.updateAllConnectionDeviceCounts();

        // Zayıf halkayı düzelt: Eğer analizör için bir polling döngüsü
        // aktif değilse ve artık register'ı varsa, şimdi başlat.
        const analyzer = this.analyzers.get(analyzerId);
        if (analyzer && !this.pollingTimers.has(analyzerId) && this.hasRegisters(analyzerId)) {
            backendLogger.info(`Polling was not active for ${analyzerId} but now has registers. Starting it.`, "PollingEngine");
            this.startPolling(analyzer);
            
            // Register eklendikten sonra, eğer bu analizörün bağlantısı kopuksa reconnect tetikle
            const analyzerConnectionIndex = this.analyzerToConnectionIndex.get(analyzer.id) || 0;
            const analyzerConnectionId = `${analyzer.getConnectionId()}:${analyzerConnectionIndex}`;
            const connection = this.connections.get(analyzerConnectionId);
            
            if (!connection || !connection.isConnected) {
                backendLogger.info(`Register added to ${analyzer.name} but connection ${analyzerConnectionId} is not available. Attempting to establish connection.`, "PollingEngine");
                // startPolling içindeki ensureConnection zaten bağlantıyı kurmaya çalışacak
            }
        }
        
        //backendLogger.info(`Surgically updated configuration for analyzer ${analyzerId}`, "PollingEngine");
    }

    private createBlocksForAnalyzer(analyzerId: string): void {
        const analyzerRegisters = Array.from(this.registers.values()).filter(r => r.analyzerId === analyzerId);
        // 'read' tipi register'ları VEYA 'write' olup kontrol tipi 'button' olanları poll bloklarına dahil et
        const readRegisters = analyzerRegisters.filter(r => r.registerType === 'read' || (r.registerType === 'write' && r.controlType === 'button'));
        
        if(readRegisters.length < analyzerRegisters.length) {
            backendLogger.info(`Analyzer ${analyzerId}: Found ${analyzerRegisters.length} total registers, but only polling ${readRegisters.length} ('read' type).`, "PollingEngine");
        }

        this.blocks.set(analyzerId, PollerBlockFactory.makeBlocks(readRegisters));
    }
    
        private hasRegisters(analyzerId: string): boolean {
            for (const register of this.registers.values()) {
                if (register.analyzerId === analyzerId) {
                    return true;
                }
            }
            return false;
        }

    public updateAnalyzerProperties(analyzerId: string, newProps: { pollMs?: number, timeoutMs?: number }): void {
        const analyzer = this.analyzers.get(analyzerId);
        if (!analyzer) return;

        let restartPolling = false;
        if (newProps.pollMs !== undefined && analyzer.pollMs !== newProps.pollMs) {
            analyzer.pollMs = newProps.pollMs;
            restartPolling = true;
        }
        if (newProps.timeoutMs !== undefined && analyzer.timeoutMs !== newProps.timeoutMs) {
            analyzer.timeoutMs = newProps.timeoutMs;
        }

        if (restartPolling) {
            this.startPolling(analyzer);
        }
        //backendLogger.info(`Surgically updated properties for analyzer ${analyzerId}`, "PollingEngine");
    }

    public removeAnalyzer(analyzerId: string): void {
        const analyzerToRemove = this.analyzers.get(analyzerId);
        if (!analyzerToRemove) {
            backendLogger.warning(`Attempted to remove non-existent analyzer: ${analyzerId}`, "PollingEngine");
            return;
        }

        backendLogger.info(`Removing analyzer ${analyzerId} (${analyzerToRemove.name})...`, "PollingEngine");

        // 1. Polling döngüsünü kesinlikle durdur
        const timer = this.pollingTimers.get(analyzerId);
        if (timer) {
            clearTimeout(timer);
            this.pollingTimers.delete(analyzerId);
            //backendLogger.debug(`Stopped polling timer for analyzer ${analyzerId}`, "PollingEngine");
        }

        // 2. Bu analizöre ait tüm registerları sil
        const registersToDelete = Array.from(this.registers.entries())
            .filter(([_, register]) => register.analyzerId === analyzerId)
            .map(([key, _]) => key);
        registersToDelete.forEach(key => this.registers.delete(key));

        // 3. Analizörü ve ilgili durumlarını sil
        this.analyzers.delete(analyzerId);
        this.analyzerPollState.delete(analyzerId);
        this.blocks.delete(analyzerId);
        this.analyzerToConnectionIndex.delete(analyzerId);

        backendLogger.info(`Successfully removed analyzer ${analyzerId} and its ${registersToDelete.length} registers.`, "PollingEngine");

        // 4. Cihaz sayılarını yeniden hesapla ve gerekirse bağlantıyı kapat
        // Bu adım çok kritik - connection cleanup'ı tetikler
        this.updateAllConnectionDeviceCounts();
    }
                 
    private getBlocksForAnalyzer(analyzerId: string): PollerBlock[] {
        return this.blocks.get(analyzerId) || [];
    }

    public getRegisterValue(registerId: string): number | string | boolean | null {
        const register = this.registers.get(registerId);
        return register ? register.getValue(null) : null;
    }
    

    private countDevicesForPooledConnection(pooledConnectionId: string): number {
        const activeAnalyzerIds = new Set<string>();
        this.registers.forEach(reg => activeAnalyzerIds.add(reg.analyzerId));

        let count = 0;
        this.analyzers.forEach(analyzer => {
            if (activeAnalyzerIds.has(analyzer.id)) {
                const gatewayId = analyzer.getConnectionId();
                const connectionIndex = this.analyzerToConnectionIndex.get(analyzer.id) || 0;
                const currentPooledId = `${gatewayId}:${connectionIndex}`;
                if (currentPooledId === pooledConnectionId) {
                    count++;
                }
            }
        });
        return count;
    }

    private updateAllConnectionDeviceCounts(): void {
        const previouslyActiveGateways = new Set(Array.from(this.pendingDeviceCounts.keys()));
        this.connections.forEach(conn => previouslyActiveGateways.add(conn.connectionId.split(':').slice(0, 2).join(':')));

        const activeAnalyzersByGateway = new Map<string, number>();

        // 1. Tüm aktif (register'ı olan) analizörleri gateway bazında say
        const activeAnalyzerIds = new Set(Array.from(this.registers.values()).map(r => r.analyzerId));
        this.analyzers.forEach(analyzer => {
            if (activeAnalyzerIds.has(analyzer.id)) {
                const gatewayId = analyzer.getConnectionId();
                activeAnalyzersByGateway.set(gatewayId, (activeAnalyzersByGateway.get(gatewayId) || 0) + 1);
            }
        });

        // 2. Mevcut, aktif bağlantıların sayısını güncelle
        this.connections.forEach((connection, pooledConnectionId) => {
            const count = this.countDevicesForPooledConnection(pooledConnectionId);
            connection.updateDeviceCount(count);
        });

        // 3. Bağlantısı olmayan gateway'ler için bekleyen sayıları güncelle
        activeAnalyzersByGateway.forEach((count, gatewayId) => {
            const pooledConnectionId = `${gatewayId}:0`;
            if (!this.connections.has(pooledConnectionId)) {
                const oldCount = this.pendingDeviceCounts.get(gatewayId);
                if (oldCount !== count) {
                    backendLogger.info(`Gateway ${gatewayId} is not connected. Storing pending device count: ${count}`, "PollingEngine");
                    this.pendingDeviceCounts.set(gatewayId, count);
                }
            }
        });

        // 4. Artık aktif olmayan gateway'ler için bekleyen sayıyı 0 olarak ayarla
        previouslyActiveGateways.forEach(gatewayId => {
            if (!activeAnalyzersByGateway.has(gatewayId)) {
                const pooledConnectionId = `${gatewayId}:0`;
                if (!this.connections.has(pooledConnectionId)) {
                    const oldCount = this.pendingDeviceCounts.get(gatewayId);
                    if (oldCount !== 0) {
                        backendLogger.info(`Gateway ${gatewayId} no longer has active analyzers. Storing pending device count: 0`, "PollingEngine");
                        this.pendingDeviceCounts.set(gatewayId, 0);
                    }
                }
            }
        });

        // 5. Artık cihazı kalmayan (deviceCount: 0) ve kullanılmayan paralel bağlantıları kapat
        const connectionsToClose = new Array<string>();
        this.connections.forEach((connection, pooledConnectionId) => {
            const deviceCountForThisPool = this.countDevicesForPooledConnection(pooledConnectionId);
            if (deviceCountForThisPool === 0) {
                connectionsToClose.push(pooledConnectionId);
            }
        });
        
        // Kapatılacak connection'ları kullanan tüm polling timer'larını önce durdur
        connectionsToClose.forEach(pooledConnectionId => {
            const connection = this.connections.get(pooledConnectionId);
            if (connection) {
                //backendLogger.info(`[Graceful Shutdown] Starting for connection: ${pooledConnectionId} (device count is zero).`, "PollingEngine");
                
                // Bu connection'ı kullanan tüm analizörlerin polling timer'larını durdur
                this.analyzers.forEach(analyzer => {
                    const analyzerConnectionId = `${analyzer.getConnectionId()}:${this.analyzerToConnectionIndex.get(analyzer.id) || 0}`;
                    if (analyzerConnectionId === pooledConnectionId) {
                        const timer = this.pollingTimers.get(analyzer.id);
                        if (timer) {
                            clearTimeout(timer);
                            this.pollingTimers.delete(analyzer.id);
                            //backendLogger.debug(`[Graceful Shutdown] Step 1: Stopped polling timer for analyzer ${analyzer.name}.`, "PollingEngine");
                        }
                    }
                });
                
                // Connection mismatch cache'ini temizle
                const keysToDelete = Array.from(this.connectionMismatchLogged).filter(key => key.includes(pooledConnectionId));
                keysToDelete.forEach(key => this.connectionMismatchLogged.delete(key));
                
                // --- KONTROLLÜ KAPATMA (GRACEFUL SHUTDOWN) ---
                //backendLogger.debug(`[Graceful Shutdown] Step 2: Setting 'isShuttingDown' flag for ${pooledConnectionId}.`, "PollingEngine");
                connection.isShuttingDown = true;

                if (connection.queue) {
                    const qSize = connection.queue.size;
                    const qPending = connection.queue.pending;
                    connection.queue.pause();
                    connection.queue.clear();
                    //backendLogger.debug(`[Graceful Shutdown] Step 3: Paused and cleared queue for ${pooledConnectionId}. (Was size: ${qSize}, pending: ${qPending})`, "PollingEngine");
                }
                
                //backendLogger.debug(`[Graceful Shutdown] Step 4: Calling close() for ${pooledConnectionId}.`, "PollingEngine");
                connection.close();
                
                this.connections.delete(pooledConnectionId);
                //backendLogger.info(`[Graceful Shutdown] Step 5: Connection ${pooledConnectionId} successfully closed and removed.`, "PollingEngine");
            }
        });
    }


    public async handleWriteRequest(payload: {
        register: any; // The full register object from the poller
        value: number;
        analyzerId: string;
        slaveId: number;
        timeoutMs: number;
    }): Promise<void> {
        const { analyzerId, slaveId, value, timeoutMs } = payload;

        // Worker'dan gelen düz objeyi Register sınıfı instance'ına dönüştür.
        // Bu sayede .encode() gibi metodları kullanabiliriz.
        const register = new Register(payload.register);

        const analyzer = this.analyzers.get(analyzerId);
        if (!analyzer) {
            backendLogger.error(`TCP write failed: Analyzer ${analyzerId} not found in PollingEngine.`, "PollingEngine");
            throw new Error(`Analyzer ${analyzerId} not found.`);
        }

        const connection = analyzer.connection;
        if (!connection || !connection.isConnected) {
            backendLogger.error(`TCP write failed: Connection for analyzer ${analyzerId} is not available.`, "PollingEngine");
            throw new Error(`Connection for ${analyzer.getConnectionId()} is not available.`);
        }

        try {
            // Değeri, veri tipine göre 16-bit word dizisine dönüştür (örn: Float32 -> 2 word)
            const wordsToWrite = register.encode(value);

            if (!wordsToWrite || wordsToWrite.length === 0) {
                throw new Error(`Failed to encode value for register ${register.id} (dataType: ${register.dataType})`);
            }
            
            const fc = wordsToWrite.length > 1 ? 'FC10' : register.writeFunctionCode;
            backendLogger.info(`Executing TCP write for ${analyzer.name}: addr=${register.addr}, words=[${wordsToWrite.join(', ')}] (from value ${value}), FC=${fc}`, "PollingEngine");

            // Her zaman writeHoldingRegisters (FC10) kullanmak daha evrensel ve güvenli.
            // Tek bir değer yazarken bile bunu destekler.
            await connection.writeHoldingRegisters(slaveId, register.addr, wordsToWrite, timeoutMs);
            
            backendLogger.info(`TCP write successful for analyzer ${analyzer.name}`, "PollingEngine");

        } catch (error) {
            backendLogger.error(`TCP write failed for analyzer ${analyzer.name}`, "PollingEngine", { error: (error as Error).message });
            throw error; // Propagate error to the worker
        }
    }
}