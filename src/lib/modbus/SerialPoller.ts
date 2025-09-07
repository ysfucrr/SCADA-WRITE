// Bu dosya, ana süreçte çalışan, sadece seri port (serial) analizörlerini yöneten poller'dır.
// Worker kullanmaz ve bu sayede V8 çökme hatalarını önler.
// Hem stabil hem de dinamik güncelleme yeteneklerine sahiptir.

import { connectToDatabase } from "../mongodb";
import { EventEmitter } from "events";
import { AnalyzerConfig, AnalyzerSettings } from "./AnalyzerSettings";
import { Register } from "./Register";
import { PollerBlock } from "./PollerBlock";
import { ModbusConnection } from "./ModbusConnection";
import { ModbusSerialConnection } from "./serialconnect";
import { PollerBlockFactory } from "./PollerBlockFactory";
import { ObjectId } from "mongodb";
import { backendLogger } from "../logger/BackendLogger";

export class SerialPoller extends EventEmitter {
    private analyzers: Map<string, AnalyzerSettings> = new Map();
    private registers: Map<string, Register> = new Map();
    private blocks: Map<string, PollerBlock[]> = new Map();
    private connections: Map<string, ModbusConnection> = new Map();
    private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
    private analyzerPollState: Map<string, { nextBlockIndex: number }> = new Map();
    private configUpdateTimeout: NodeJS.Timeout | null = null;
    private isReloading: boolean = false;
    private noRegisterLoggedConnections: Set<string> = new Set(); // Log spam'ini önlemek için
    private connectionLossLoggedConnections: Set<string> = new Set(); // Connection loss log spam'ini önlemek için
    private reconnectTimers: Map<string, NodeJS.Timeout> = new Map(); // Reconnect timer'larını takip et
    private portReconnectTimers: Map<string, NodeJS.Timeout> = new Map(); // COM port bazlı reconnect timer'ları
    private activeReconnects: Set<string> = new Set(); // Aktif reconnect işlemleri

    constructor() {
        super();
    }

    public async start(): Promise<void> {
        try {
            await this.loadConfiguration();
            this.createBlocksForAnalyzers();
            this.analyzers.forEach(analyzer => this.startPolling(analyzer));
            this.setupChangeStreams();
            backendLogger.info(`SerialPoller started for ${this.analyzers.size} serial analyzer(s).`, "SerialPoller");
        } catch (err: any) {
            backendLogger.error("Failed to start SerialPoller", "SerialPoller", { error: err.message });
        }
    }

    private async startPolling(analyzer: AnalyzerSettings): Promise<void> {
        if (this.pollingTimers.has(analyzer.id)) {
            clearTimeout(this.pollingTimers.get(analyzer.id)!);
            this.pollingTimers.delete(analyzer.id);
        }

        const hasRegisters = Array.from(this.registers.values()).some(r => r.analyzerId === analyzer.id);
        if (!hasRegisters) {
            backendLogger.info(`No registers for serial analyzer '${analyzer.name}'. Polling stopped.`, "SerialPoller");
            return;
        }

        const blocks = this.blocks.get(analyzer.id) || [];
        if (blocks.length === 0) return;

        const connection = await this.ensureConnection(analyzer);
        if (!connection) {
            setTimeout(() => this.startPolling(analyzer), 30000);
            return;
        }

        const totalPollMs = Math.max(analyzer.pollMs || 1000, 500);
        const intervalMs = Math.max(50, totalPollMs / blocks.length);

        const pollLoop = async () => {
            // Register kontrolü - eğer register yoksa döngüyü durdur
            if (!this.hasRegisters(analyzer.id)) {
                //backendLogger.info(`No more registers for serial analyzer ${analyzer.id}, stopping its poll loop.`, "SerialPoller");
                this.pollingTimers.delete(analyzer.id);
                return;
            }

            try {
                await this.pollNextBlockForAnalyzer(analyzer, connection);
                const timer = setTimeout(pollLoop, intervalMs);
                this.pollingTimers.set(analyzer.id, timer);
            } catch (err) {
                if (err instanceof Error) backendLogger.warning(`Polling block error for ${analyzer.name}: ${err.message}`, "SerialPoller");
                const timer = setTimeout(pollLoop, intervalMs);
                this.pollingTimers.set(analyzer.id, timer);
            }
        };

        const initialTimer = setTimeout(pollLoop, intervalMs);
        this.pollingTimers.set(analyzer.id, initialTimer);
    }
    
    private async pollNextBlockForAnalyzer(analyzer: AnalyzerSettings, connection: ModbusConnection): Promise<void> {
        if (!connection.isConnected) {
            this.handleConnectionLoss(connection);
            return;
        }
    
        let pollState = this.analyzerPollState.get(analyzer.id);
        if (!pollState) {
            pollState = { nextBlockIndex: 0 };
            this.analyzerPollState.set(analyzer.id, pollState);
        }
        
        const blocks = this.blocks.get(analyzer.id) || [];
        if (blocks.length === 0) {
            return;
        }

        const block = blocks[pollState.nextBlockIndex];
        pollState.nextBlockIndex = (pollState.nextBlockIndex + 1) % blocks.length;
    
        if (!block || block.shouldSkip()) return;
    
        try {
            const words = await connection.readHoldingRegisters(analyzer.slaveId, block.start, block.qty, analyzer.timeoutMs);
            block.decodeRegisters(words);
            block.registers.forEach(register => {
                const value = register.getValue();
                if (value !== null && value !== undefined) {
                    this.emit('registerUpdated', { id: register.id, analyzerId: analyzer.id, addr: register.addr, value, lastUpdated: Date.now(), dataType: register.dataType, bit: register.bit });
                }
            });
        } catch (err) {
             block.incrementMissForAll();
             if (err instanceof Error && err.message.includes('Port Not Open')) {
                this.handleConnectionLoss(connection);
             }
        }
    }

    private async ensureConnection(analyzer: AnalyzerSettings): Promise<ModbusConnection | null> {
        const connectionId = analyzer.getConnectionId();
        const portName = String(analyzer.portName);
        
        // Önce bağlantı var mı kontrol et
        if (this.connections.has(connectionId)) {
            const conn = this.connections.get(connectionId)!;
            
            // Bağlantı açık mı? Değilse tekrar aç
            if(!conn.isConnected) {
                try {
                    // Aktif reconnect işlemi kontrolü
                    if (this.activeReconnects.has(portName)) {
                        backendLogger.debug(`Port ${portName} already has an active reconnect process. Waiting...`, "SerialPoller");
                        // Aktif reconnect var, bu işlemi şimdilik atla
                        return conn;
                    }
                    
                    // Aktif reconnect işaretleyici
                    this.activeReconnects.add(portName);
                    
                    try {
                        await conn.connect();
                        
                        // Bağlantı kurulduğunu bildir
                        this.emit('connectionStatusChanged', {
                            gatewayId: portName,
                            status: 'connected',
                            connectionId
                        });
                    } finally {
                        // Her durumda aktif reconnect işaretleyiciyi temizle
                        setTimeout(() => {
                            this.activeReconnects.delete(portName);
                        }, 5000); // 5 saniye sonra temizle
                    }
                } catch(e) { /* ignore connect error, will be retried */ }
            }
            return conn;
        }

        try {
            // Aktif reconnect işlemi kontrolü
            if (this.activeReconnects.has(portName)) {
                backendLogger.debug(`Port ${portName} already has an active reconnect process. Waiting...`, "SerialPoller");
                return null;
            }
            
            // Aktif reconnect işaretleyici
            this.activeReconnects.add(portName);
            
            try {
                // Yeni bağlantı oluştur
                const connection = new ModbusSerialConnection(portName, {
                    baudRate: Number(analyzer.baudRate),
                    parity: analyzer.parity,
                    stopBits: analyzer.stopBits,
                });
                
                await connection.connect();
                this.connections.set(connectionId, connection);
                
                // Bağlantı kurulduğunu bildir
                this.emit('connectionStatusChanged', {
                    gatewayId: portName,
                    status: 'connected',
                    connectionId
                });
                
                // Bu port için tüm connection loss flag'lerini temizle
                Array.from(this.connectionLossLoggedConnections.keys())
                    .filter(id => id.startsWith(portName + '@'))
                    .forEach(id => this.connectionLossLoggedConnections.delete(id));
                
                return connection;
            } finally {
                // Her durumda aktif reconnect işaretleyiciyi temizle
                setTimeout(() => {
                    this.activeReconnects.delete(portName);
                }, 5000); // 5 saniye sonra temizle
            }
        } catch (err) {
            // Hata zaten SerialConnection tarafından loglanıyor, burada tekrar loglama
            // if (err instanceof Error) backendLogger.error(`Serial connection failed for ${connectionId}: ${err.message}`, "SerialPoller");
            return null;
        }
    }

    private handleConnectionLoss(connection: ModbusConnection): void {
        const connectionId = connection.connectionId;
        const portName = connectionId.split('@')[0]; // Serial için format: portName@baudRate (örn: COM3@9600)
        
        // Eğer bu connection için zaten işlem yapıldıysa, tekrar yapma
        if (this.connectionLossLoggedConnections.has(connectionId)) {
            return;
        }
        
        // Bu connection için işlem yapıldığını işaretle
        this.connectionLossLoggedConnections.add(connectionId);
        
        if(this.connections.has(connectionId)) {
            this.connections.get(connectionId)?.close();
            this.connections.delete(connectionId);
        }
        
        // Bağlantı durumu değişikliğini bildir
        this.emit('connectionStatusChanged', {
            gatewayId: portName,
            status: 'disconnected',
            connectionId
        });
        
        // TCP'deki gibi register kontrolü yap - sadece aktif register'ı olan analizörler için reconnect dene
        const hasActiveRegisters = this.checkActiveRegistersForConnection(portName);
        
        if (hasActiveRegisters) {
            // ÖNEMLİ: Port bazlı yeniden bağlantı zamanlayıcısı kullan (bağlantı bazlı değil)
            // Bu, aynı port için tüm bağlantı isteklerini tek bir işlemde toplayacak
            if (!this.portReconnectTimers.has(portName)) {
                backendLogger.info(`Active registers found for serial port ${portName}. Will attempt reconnect in 30 seconds.`, "SerialPoller");
                
                // Port bazlı tek bir reconnect işlemi zamanla
                const reconnectTimer = setTimeout(() => {
                    this.portReconnectTimers.delete(portName);
                    
                    // Aktif reconnect işlemi kontrolü - çakışmaları önle
                    if (this.activeReconnects.has(portName)) {
                        backendLogger.info(`Port ${portName} already has an active reconnect process. Skipping duplicate reconnect.`, "SerialPoller");
                        return;
                    }
                    
                    // Aktif reconnect işaretleyici
                    this.activeReconnects.add(portName);
                    
                    backendLogger.info(`Connection lost for serial port ${portName}. Re-initiating polling sequence with reconnect logic.`, "SerialPoller");
                    
                    // İlgili tüm analizörlerin bağlantı ID'lerini topla
                    const affectedConnectionIds = new Set<string>();
                    
                    this.analyzers.forEach(analyzer => {
                        const analyzerConnectionId = analyzer.getConnectionId();
                        if (analyzerConnectionId.startsWith(portName + '@')) {
                            affectedConnectionIds.add(analyzerConnectionId);
                        }
                    });
                    
                    // Tüm etkilenen bağlantılar için Connection Loss flag'ini temizle
                    affectedConnectionIds.forEach(connId => {
                        this.connectionLossLoggedConnections.delete(connId);
                    });
                    
                    // Port için ilk analizör ile bağlantıyı yeniden kur
                    // Bu, port açma işlemini bir kez yapacak ve diğer analizörler aynı bağlantıyı paylaşacak
                    let reconnectStarted = false;
                    
                    for (const analyzer of this.analyzers.values()) {
                        const analyzerConnectionId = analyzer.getConnectionId();
                        
                        if (analyzerConnectionId.startsWith(portName + '@') && !reconnectStarted) {
                            reconnectStarted = true;
                            
                            // Bu analizör için bağlantıyı başlat
                            setTimeout(async () => {
                                try {
                                    await this.ensureConnection(analyzer);
                                    
                                    // Bağlantı başarılı olduysa, diğer analizörlerin polling'ini başlat
                                    setTimeout(() => {
                                        this.analyzers.forEach(otherAnalyzer => {
                                            const otherConnectionId = otherAnalyzer.getConnectionId();
                                            if (otherConnectionId.startsWith(portName + '@') && otherAnalyzer.id !== analyzer.id) {
                                                this.startPolling(otherAnalyzer);
                                            }
                                        });
                                        
                                        // Aktif reconnect işaretleyiciyi temizle
                                        this.activeReconnects.delete(portName);
                                    }, 2000); // Diğer analizörler için 2 saniye bekle
                                    
                                } catch (err) {
                                    backendLogger.error(`Port ${portName} reconnect failed: ${(err as Error).message}`, "SerialPoller");
                                    this.activeReconnects.delete(portName);
                                }
                            }, 1000);
                            
                            break;
                        }
                    }
                    
                }, 30000); // 30 saniye bekle
                
                this.portReconnectTimers.set(portName, reconnectTimer);
            } else {
                backendLogger.debug(`Port ${portName} already has a scheduled reconnect timer. Not creating a duplicate.`, "SerialPoller");
            }
            
            // Eski bağlantı bazlı zamanlayıcıyı temizle
            if (this.reconnectTimers.has(connectionId)) {
                clearTimeout(this.reconnectTimers.get(connectionId)!);
                this.reconnectTimers.delete(connectionId);
            }
            
        } else {
            backendLogger.info(`No active registers for serial port ${portName}. Reconnect will not be attempted.`, "SerialPoller");
            
            // Register'ı olmayan analizörler için polling timer'larını durdur
            this.analyzers.forEach(analyzer => {
                const analyzerConnectionId = analyzer.getConnectionId();
                const isMatch = analyzerConnectionId === connectionId || analyzerConnectionId.startsWith(portName + '@');
                
                if (isMatch) {
                    const timer = this.pollingTimers.get(analyzer.id);
                    if (timer) {
                        clearTimeout(timer);
                        this.pollingTimers.delete(analyzer.id);
                        backendLogger.info(`Stopped polling for ${analyzer.name} - no active registers.`, "SerialPoller");
                    }
                }
            });
            
            // Connection loss flag'ini temizle
            this.connectionLossLoggedConnections.delete(connectionId);
        }
    }

    /**
     * TCP'deki gibi aktif register kontrolü - bağlantı için aktif register var mı kontrol eder
     */
    private checkActiveRegistersForConnection(connectionId: string): boolean {
        // Bu bağlantıyı kullanan analizörleri bul
        for (const analyzer of this.analyzers.values()) {
            const analyzerConnectionId = analyzer.getConnectionId();
            
            // Connection ID eşleşmesi: hem tam eşleşme hem de kısmi eşleşme kontrol et
            // connectionId = "COM3", analyzerConnectionId = "COM3@9600" durumu için
            const isMatch = analyzerConnectionId === connectionId || analyzerConnectionId.startsWith(connectionId + '@');
            
            if (isMatch) {
                // Bu analizör için aktif register var mı kontrol et
                for (const register of this.registers.values()) {
                    if (register.analyzerId === analyzer.id) {
                        return true; // Aktif register bulundu
                    }
                }
            }
        }
        
        return false; // Bu bağlantı için aktif register bulunamadı
    }

    private async loadConfiguration(): Promise<void> {
        const { db } = await connectToDatabase();
        const analyzerDocs = await db.collection('analyzers').find({ connection: 'serial' }).toArray();
        const rtuDocs = await db.collection('rtus').find({}).toArray();
        const rtusById: Record<string, any> = {};
        rtuDocs.forEach((rtu: any) => { rtusById[rtu._id.toString()] = rtu; });

        this.analyzers.clear();
        this.registers.clear();

        for (const doc of analyzerDocs) {
            const rtu = doc.gateway ? rtusById[doc.gateway.toString()] : null;
            if (!rtu) continue;

            const analyzerId = doc._id.toString();
            const analyzerConfig: AnalyzerConfig = {
                id: analyzerId, _id: analyzerId, name: doc.name,
                slaveId: parseInt(doc.slaveId) || 1, pollMs: parseInt(doc.poll) || 1000,
                timeoutMs: parseInt(doc.timeout) || 1000, connType: doc.connection,
                gatewayId: doc.gateway?.toString() || '',
                portName: rtu.port,
                baudRate: parseInt(rtu.baudRate),
                parity: rtu.parity,
                stopBits: parseInt(rtu.stopBits),
            };
            this.analyzers.set(analyzerId, new AnalyzerSettings(analyzerConfig));
        }

        const buildingDocs = await db.collection('buildings').find({}).toArray();
        const registers = this.loadRegistersFromBuildings(buildingDocs);
        
        for (const doc of registers) {
            if(this.analyzers.has(doc.analyzerId)) {
                this.registers.set(doc.id.toString(), new Register({ ...doc, _id: doc.id.toString() }));
            }
        }
    }

    private createBlocksForAnalyzers(): void {
        this.blocks.clear();
        this.analyzers.forEach((_, analyzerId) => {
            const analyzerRegisters = Array.from(this.registers.values()).filter(r => r.analyzerId === analyzerId);
            this.blocks.set(analyzerId, PollerBlockFactory.makeBlocks(analyzerRegisters));
        });
    }

    private loadRegistersFromBuildings(buildings: any[]): any[] {
        const allRegisters: any[] = [];
        const findRegistersInFlowData = (flowData: any, buildingId: string, parentId: any) => {
            if (!flowData || !flowData.nodes) return [];
            return flowData.nodes
                .filter((node: any) => node.type === 'registerNode' && node.data?.analyzerId)
                .map((node: any) => ({
                    id: node.id.toString(), name: node.data?.name || `Register ${node.data?.address}`,
                    buildingId: buildingId, parentId: parentId, analyzerId: node.data.analyzerId,
                    address: parseInt(node.data?.address) || 0, dataType: node.data?.dataType,
                    scale: parseFloat(node.data?.scale) || 1, byteOrder: node.data?.byteOrder,
                    bit: node.data?.bit || 0
                }));
        };
        buildings.forEach((building: any) => {
            const buildingId = building._id.toString();
            if (building.flowData) allRegisters.push(...findRegistersInFlowData(building.flowData, buildingId, `building_${buildingId}`));
            if (building.floors) {
                building.floors.forEach((floor: any) => {
                    const floorId = floor._id ? floor._id.toString() : floor.id;
                    if (floor.flowData) allRegisters.push(...findRegistersInFlowData(floor.flowData, buildingId, `floor_${floorId}`));
                    if (floor.rooms) {
                        floor.rooms.forEach((room: any) => {
                            const roomId = room._id ? room._id.toString() : room.id;
                            if (room.flowData) allRegisters.push(...findRegistersInFlowData(room.flowData, buildingId, `room_${roomId}`));
                        });
                    }
                });
            }
        });
        return allRegisters;
    }

    private hasRegisters(analyzerId: string): boolean {
        for (const register of this.registers.values()) {
            if (register.analyzerId === analyzerId) {
                return true;
            }
        }
        return false;
    }

    private setupChangeStreams(): void {
        const setup = async (collectionName: 'analyzers' | 'rtus', handler: (change: any) => void) => {
            try {
                const { db } = await connectToDatabase();
                const changeStream = db.collection(collectionName).watch([], { fullDocumentBeforeChange: "whenAvailable" });
                changeStream.on("change", (change) => {
                    if (this.configUpdateTimeout) clearTimeout(this.configUpdateTimeout);
                    this.configUpdateTimeout = setTimeout(() => handler(change), 1500);
                });
                changeStream.on('error', (err) => {
                    backendLogger.error(`Change stream error on ${collectionName} for SerialPoller: ${err.message}`, "SerialPoller");
                    setTimeout(() => setup(collectionName, handler), 5000);
                });
                backendLogger.info(`Change stream for SerialPoller established for collection ${collectionName}`, "SerialPoller");
            } catch (err: any) {
                backendLogger.error(`Failed to set up change stream for ${collectionName}: ${err.message}`, "SerialPoller");
                setTimeout(() => setup(collectionName, handler), 5000);
            }
        };

        const analyzerChangeHandler = (change: any) => {
            const analyzerId = change.documentKey._id.toString();
            
            // Delete işlemi için: sadece kendi analyzer listesinde olan analizörleri işle
            if (change.operationType === 'delete') {
                if (!this.analyzers.has(analyzerId)) {
                    // Bu analizör SerialPoller'da yok, muhtemelen TCP - sessizce geç
                    backendLogger.debug(`Analyzer ${analyzerId} deleted but not managed by SerialPoller. Likely TCP.`, "SerialPoller");
                    return;
                }
                // Bu serial analizör, işleme devam et
                backendLogger.info(`Serial analyzer ${analyzerId} deleted. Processing...`, "SerialPoller");
            } else {
                // Insert/Update işlemleri için connection type kontrolü yap
                const doc = change.fullDocument;
                if (doc && doc.connection !== 'serial') {
                    backendLogger.debug(`Analyzer change detected but connection type is '${doc.connection}', not serial. Skipping.`, "SerialPoller");
                    return;
                }
            }

            if (change.operationType === 'insert') {
                // Serial analizör eklendi - surgical update yap
                backendLogger.info(`Serial analyzer ${analyzerId} inserted. Processing surgical update.`, "SerialPoller");
                this.handleAnalyzerInsert(analyzerId).catch(err => {
                    backendLogger.error(`Error handling serial analyzer insert for ${analyzerId}`, "SerialPoller", { error: (err as Error).message });
                });
                return;
            }
            
            if (change.operationType === 'delete') {
                // Serial analizör silindi - surgical update yap
                backendLogger.info(`Serial analyzer ${analyzerId} deleted. Processing surgical update.`, "SerialPoller");
                this.handleAnalyzerDelete(analyzerId);
                return;
            }
            
            if (change.operationType === 'update' && change.updateDescription.updatedFields.gateway) {
                // Gateway değişti - bu durumda bulk update gerekli
                backendLogger.info(`SerialPoller is reloading configuration. Reason: Serial analyzer gateway changed`, "SerialPoller");
                this.handleBulkUpdate(`Serial analyzer gateway changed`);
                return;
            }
            
            if (change.operationType === 'update') {
                const analyzerId = change.documentKey._id.toString();
                const analyzer = this.analyzers.get(analyzerId);
                if (!analyzer) return;

                const updatedFields = change.updateDescription.updatedFields;
                analyzer.pollMs = parseInt(updatedFields.poll) ?? analyzer.pollMs;
                analyzer.timeoutMs = parseInt(updatedFields.timeout) ?? analyzer.timeoutMs;
                
                backendLogger.info(`Light update for serial analyzer '${analyzer.name}'. Restarting its polling.`, "SerialPoller");
                this.startPolling(analyzer);
            }
        };

        // Buildings change stream kaldırıldı - sadece ModbusPoller yönetecek
        // Bu sayede çifte işlem önleniyor ve merkezi karar verme sağlanıyor
        setup('rtus', () => this.handleBulkUpdate("RTU definition changed"));
        setup('analyzers', analyzerChangeHandler);
    }


    private async handleAnalyzerInsert(analyzerId: string): Promise<void> {
        if (this.isReloading) return;
        this.isReloading = true;
        
        try {
            const { db } = await connectToDatabase();
            const analyzerDoc = await db.collection('analyzers').findOne({ _id: new ObjectId(analyzerId) });
            
            if (!analyzerDoc || analyzerDoc.connection !== 'serial') {
                backendLogger.debug(`Analyzer ${analyzerId} not found or not serial type. Skipping insert.`, "SerialPoller");
                return;
            }
            
            // RTU bilgisini al - ObjectId dönüşümü ile
            let rtu = null;
            if (analyzerDoc.gateway) {
                try {
                    // Önce string olarak dene
                    rtu = await db.collection('rtus').findOne({ _id: analyzerDoc.gateway });
                    if (!rtu) {
                        // String olarak bulamazsa ObjectId olarak dene
                        rtu = await db.collection('rtus').findOne({ _id: new ObjectId(analyzerDoc.gateway) });
                    }
                } catch (err) {
                    backendLogger.error(`Error finding RTU for serial analyzer ${analyzerId}`, "SerialPoller", {
                        error: (err as Error).message,
                        gatewayId: analyzerDoc.gateway?.toString()
                    });
                }
            }
            
            if (!rtu) {
                // RTU koleksiyonundaki tüm kayıtları logla (debug için)
                const allRtus = await db.collection('rtus').find({}).toArray();
                backendLogger.warning(`No RTU found for serial analyzer ${analyzerId}. Gateway: ${analyzerDoc.gateway}. Available RTUs: ${allRtus.length}`, "SerialPoller", {
                    analyzerId,
                    gatewayId: analyzerDoc.gateway?.toString(),
                    analyzerName: analyzerDoc.name,
                    availableRtuIds: allRtus.map(r => r._id.toString())
                });
                return;
            }
            
            // RTU'nun serial port bilgisi var mı kontrol et
            if (!rtu.port) {
                backendLogger.warning(`RTU found but no port configured for serial analyzer ${analyzerId}. RTU: ${rtu._id}. Skipping insert.`, "SerialPoller", {
                    analyzerId,
                    rtuId: rtu._id.toString(),
                    analyzerName: analyzerDoc.name
                });
                return;
            }
            
            // Yeni analizörü ekle
            const analyzerConfig: AnalyzerConfig = {
                id: analyzerId, _id: analyzerId, name: analyzerDoc.name,
                slaveId: parseInt(analyzerDoc.slaveId) || 1, pollMs: parseInt(analyzerDoc.poll) || 1000,
                timeoutMs: parseInt(analyzerDoc.timeout) || 1000, connType: analyzerDoc.connection,
                gatewayId: analyzerDoc.gateway?.toString() || '',
                portName: rtu.port,
                baudRate: parseInt(rtu.baudRate),
                parity: rtu.parity,
                stopBits: parseInt(rtu.stopBits),
            };
            
            this.analyzers.set(analyzerId, new AnalyzerSettings(analyzerConfig));
            
            // Bu analizöre ait register'ları yükle
            const buildingDocs = await db.collection('buildings').find({
                "flowData.nodes.data.analyzerId": analyzerId
            }).toArray();
            
            const registers = this.loadRegistersFromBuildings(buildingDocs).filter(r => r.analyzerId === analyzerId);
            registers.forEach(regDoc => {
                this.registers.set(regDoc.id.toString(), new Register({ ...regDoc, _id: regDoc.id.toString() }));
            });
            
            // Block'ları yeniden oluştur ve polling'i başlat
            this.createBlocksForAnalyzers();
            const analyzer = this.analyzers.get(analyzerId);
            if (analyzer) {
                this.startPolling(analyzer);
                backendLogger.info(`Serial analyzer '${analyzer.name}' inserted and polling started.`, "SerialPoller");
            }
            
        } catch (err) {
            backendLogger.error(`Failed to handle serial analyzer insert for ${analyzerId}`, "SerialPoller", { error: (err as Error).message });
        } finally {
            this.isReloading = false;
        }
    }

    private handleAnalyzerDelete(analyzerId: string): void {
        if (this.isReloading) return;
        
        try {
            // Polling timer'ını durdur
            if (this.pollingTimers.has(analyzerId)) {
                clearTimeout(this.pollingTimers.get(analyzerId)!);
                this.pollingTimers.delete(analyzerId);
                backendLogger.info(`Stopped polling timer for deleted serial analyzer ${analyzerId}`, "SerialPoller");
            }
            
            // Analizörü kaldır
            const analyzer = this.analyzers.get(analyzerId);
            if (analyzer) {
                this.analyzers.delete(analyzerId);
                backendLogger.info(`Removed serial analyzer '${analyzer.name}' from analyzer list.`, "SerialPoller");
            }
            
            // Bu analizöre ait register'ları kaldır
            const registersToDelete = Array.from(this.registers.entries())
                .filter(([_, register]) => register.analyzerId === analyzerId)
                .map(([id, _]) => id);
            
            registersToDelete.forEach(registerId => {
                this.registers.delete(registerId);
            });
            
            if (registersToDelete.length > 0) {
                backendLogger.info(`Removed ${registersToDelete.length} registers for deleted serial analyzer ${analyzerId}`, "SerialPoller");
            }
            
            // Block'ları yeniden oluştur
            this.createBlocksForAnalyzers();
            
            // Eğer bu analizörün kullandığı bağlantıyı başka analizör kullanmıyorsa kapat
            if (analyzer) {
                const connectionId = analyzer.getConnectionId();
                const isConnectionStillNeeded = Array.from(this.analyzers.values())
                    .some(a => a.getConnectionId() === connectionId);
                
                if (!isConnectionStillNeeded && this.connections.has(connectionId)) {
                    this.connections.get(connectionId)?.close();
                    this.connections.delete(connectionId);
                    backendLogger.info(`Closed unused serial connection: ${connectionId}`, "SerialPoller");
                }
            }
            
        } catch (err) {
            backendLogger.error(`Failed to handle serial analyzer delete for ${analyzerId}`, "SerialPoller", { error: (err as Error).message });
        }
    }

    private async handleBulkUpdate(reason: string): Promise<void> {
        if (this.isReloading) return;
        this.isReloading = true;
        try {
            backendLogger.info(`SerialPoller is reloading configuration. Reason: ${reason}`, "SerialPoller");
            
            const oldConnections = new Map(this.connections);
            this.pollingTimers.forEach(timer => clearTimeout(timer));
            this.pollingTimers.clear();
            
            await this.loadConfiguration();
            this.createBlocksForAnalyzers();
            
            this.analyzers.forEach(analyzer => this.startPolling(analyzer));

            oldConnections.forEach((conn, connId) => {
                const isConnectionStillNeeded = Array.from(this.analyzers.values()).some(a => a.getConnectionId() === connId);
                if (!isConnectionStillNeeded) {
                    conn.close();
                    this.connections.delete(connId);
                    backendLogger.info(`Closed and removed unused serial connection: ${connId}`, "SerialPoller");
                }
            });
        } catch (err) {
             backendLogger.error("Failed to process bulk update for SerialPoller.", "SerialPoller", { error: (err as Error).message });
        } finally {
            this.isReloading = false;
        }
    }

    /**
     * ModbusPoller tarafından çağrılır - belirli bir analizör için register'ları günceller
     */
    public async updateAnalyzerRegisters(analyzerId: string): Promise<void> {
        if (this.isReloading) return;
        
        try {
            // Bu analizörün SerialPoller tarafından yönetilip yönetilmediğini kontrol et
            if (!this.analyzers.has(analyzerId)) {
                backendLogger.debug(`Analyzer ${analyzerId} not managed by SerialPoller. Skipping register update.`, "SerialPoller");
                return;
            }

            const { db } = await connectToDatabase();
            
            // Bu analizöre ait register içeren TÜM binaları bul
            const buildingsWithAnalyzer = await db.collection('buildings').find({
                "flowData.nodes.data.analyzerId": analyzerId
            }).toArray();

            // Bu binalardan analizör için tam register listesini oluştur
            const completeRegisterList = this.loadRegistersFromBuildings(buildingsWithAnalyzer)
                                             .filter(r => r.analyzerId === analyzerId);

            // Eski register'ları temizle
            const oldRegisterIds = Array.from(this.registers.keys()).filter(id =>
                this.registers.get(id)?.analyzerId === analyzerId
            );
            oldRegisterIds.forEach(id => this.registers.delete(id));

            // Yeni register'ları ekle
            completeRegisterList.forEach(regDoc => {
                this.registers.set(regDoc.id.toString(), new Register({ ...regDoc, _id: regDoc.id.toString() }));
            });

            // Block'ları yeniden oluştur
            this.createBlocksForAnalyzers();

            const analyzer = this.analyzers.get(analyzerId);
            if (analyzer) {
                // Eski timer'ı durdur
                if (this.pollingTimers.has(analyzerId)) {
                    clearTimeout(this.pollingTimers.get(analyzerId)!);
                    this.pollingTimers.delete(analyzerId);
                }

                // Register sayısına göre bağlantı yönetimi
                if (completeRegisterList.length === 0) {
                    // Register kalmadı - sadece reconnect timer'ını durdur, portu kapatma
                    const connectionId = analyzer.getConnectionId();
                    const connection = this.connections.get(connectionId);
                    
                    if (connection) {
                        //backendLogger.info(`No registers left for analyzer '${analyzer.name}'. Stopping reconnect attempts but keeping port available.`, "SerialPoller");
                        
                        // Reconnect timer'ını durdur
                        if ((connection as any).reconnectTimer) {
                            clearTimeout((connection as any).reconnectTimer);
                            (connection as any).reconnectTimer = null;
                            backendLogger.debug(`Stopped reconnect timer for connection ${connectionId}`, "SerialPoller");
                        }
                        
                        // Bağlantıyı kapatmıyoruz, sadece reconnect timer'ını durduruyoruz
                        // Bu sayede register tekrar eklendiğinde port hemen kullanılabilir
                        backendLogger.info(`Reconnect attempts stopped for ${connectionId} due to no active registers. Port remains available.`, "SerialPoller");
                    }
                } else {
                    // Register var - polling'i başlat
                    this.startPolling(analyzer);
                }
                
                backendLogger.info(`Serial analyzer '${analyzer.name}' registers updated and polling restarted. Register count: ${completeRegisterList.length}`, "SerialPoller");
            }

        } catch (err) {
            backendLogger.error(`Failed to update registers for serial analyzer ${analyzerId}`, "SerialPoller", { error: (err as Error).message });
        }
    }

    /**
     * Serial analyzer için register yazma işlemi
     */
    public async writeRegister(analyzerId: string, address: number, value: number): Promise<void> {
        try {
            const analyzer = this.analyzers.get(analyzerId);
            if (!analyzer) {
                throw new Error(`Serial analyzer not found: ${analyzerId}`);
            }

            const connection = await this.ensureConnection(analyzer);
            if (!connection) {
                throw new Error(`Serial connection not available for analyzer: ${analyzerId}`);
            }

            // Write işlemi yap
            await connection.writeHoldingRegister(analyzer.slaveId, address, value, analyzer.timeoutMs);
            
            backendLogger.info(`Serial write successful: Analyzer=${analyzerId}, Address=${address}, Value=${value}`, "SerialPoller");

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            backendLogger.error(`Serial write failed: ${errorMessage}`, "SerialPoller", { analyzerId, address, value });
            throw error;
        }
    }

    /**
     * Serial analyzer için çoklu register yazma işlemi
     */
    public async writeMultipleRegisters(analyzerId: string, address: number, values: number[]): Promise<void> {
        try {
            const analyzer = this.analyzers.get(analyzerId);
            if (!analyzer) {
                throw new Error(`Serial analyzer not found: ${analyzerId}`);
            }

            const connection = await this.ensureConnection(analyzer);
            if (!connection) {
                throw new Error(`Serial connection not available for analyzer: ${analyzerId}`);
            }

            // Write multiple işlemi yap
            await connection.writeHoldingRegisters(analyzer.slaveId, address, values, analyzer.timeoutMs);
            
            backendLogger.info(`Serial write multiple successful: Analyzer=${analyzerId}, Address=${address}, Values=[${values.join(',')}]`, "SerialPoller");

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            backendLogger.error(`Serial write multiple failed: ${errorMessage}`, "SerialPoller", { analyzerId, address, values });
            throw error;
        }
    }
}