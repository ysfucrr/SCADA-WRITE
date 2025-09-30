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
    private pollingTimers: Map<string, any> = new Map(); // Anahtar: connectionId
    private connectionPollState: Map<string, { nextAnalyzerIndex: number; nextBlockIndex: number }> = new Map();
    private configUpdateTimeout: any | null = null;
    private isReloading: boolean = false;
    private connectionLossLoggedConnections: Set<string> = new Set(); // Connection loss log spam'ini önlemek için
    private portReconnectTimers: Map<string, any> = new Map(); // COM port bazlı reconnect timer'ları
    private activeReconnects: Set<string> = new Set(); // Aktif reconnect işlemleri

    constructor() {
        super();
    }

    public async start(): Promise<void> {
        try {
            await this.loadConfiguration();
            this.createBlocksForAnalyzers();
            this.startPollingForUniqueConnections();
            this.setupChangeStreams();
            backendLogger.info(`SerialPoller started for ${this.analyzers.size} serial analyzer(s).`, "SerialPoller");
        } catch (err: any) {
            backendLogger.error("Failed to start SerialPoller", "SerialPoller", { error: err.message });
        }
    }

    private startPollingForUniqueConnections(): void {
        const uniqueConnectionIds = new Set<string>();
        this.analyzers.forEach(analyzer => {
            if (this.hasRegisters(analyzer.id)) {
                uniqueConnectionIds.add(analyzer.getConnectionId());
            }
        });

        uniqueConnectionIds.forEach(connectionId => {
            this.startPollingForConnection(connectionId);
        });
    }

    private async startPollingForConnection(connectionId: string): Promise<void> {
        if (this.pollingTimers.has(connectionId)) {
            clearTimeout(this.pollingTimers.get(connectionId)!);
            this.pollingTimers.delete(connectionId);
        }

        const analyzersForConnection = Array.from(this.analyzers.values()).filter(a => a.getConnectionId() === connectionId);
        if (analyzersForConnection.length === 0 || !analyzersForConnection.some(a => this.hasRegisters(a.id))) {
            backendLogger.info(`No active analyzers for connection ${connectionId}. Stopping poll.`, "SerialPoller");
            return;
        }

        const firstAnalyzer = analyzersForConnection[0];
        const connection = await this.ensureConnection(firstAnalyzer);
        if (!connection) {
            setTimeout(() => this.startPollingForConnection(connectionId), 30000);
            return;
        }

        const minPollMs = Math.min(...analyzersForConnection.map(a => Math.max(a.pollMs || 1000, 500)));
        const totalBlocks = analyzersForConnection.reduce((sum, a) => sum + (this.blocks.get(a.id)?.length || 0), 0);
        const intervalMs = Math.max(50, minPollMs / (totalBlocks || 1));

        const pollLoop = async () => {
            const currentAnalyzers = Array.from(this.analyzers.values()).filter(a => a.getConnectionId() === connectionId && this.hasRegisters(a.id));
            if (currentAnalyzers.length === 0) {
                backendLogger.info(`No more active analyzers for ${connectionId}. Stopping its poll loop.`, "SerialPoller");
                this.pollingTimers.delete(connectionId);
                return;
            }

            try {
                await this.pollConnection(connectionId, connection);
            } catch (err) {
                // Errors are handled inside pollConnection
            } finally {
                const timer = setTimeout(pollLoop, intervalMs);
                this.pollingTimers.set(connectionId, timer);
            }
        };

        const initialTimer = setTimeout(pollLoop, intervalMs);
        this.pollingTimers.set(connectionId, initialTimer);
    }
    
    private async pollConnection(connectionId: string, connection: ModbusConnection): Promise<void> {
        if (!connection.isConnected) {
            this.handleConnectionLoss(connection);
            return;
        }

        let state = this.connectionPollState.get(connectionId);
        if (!state) {
            state = { nextAnalyzerIndex: 0, nextBlockIndex: 0 };
            this.connectionPollState.set(connectionId, state);
        }

        const analyzers = Array.from(this.analyzers.values()).filter(a => a.getConnectionId() === connectionId && this.hasRegisters(a.id));
        if (analyzers.length === 0) return;

        if (state.nextAnalyzerIndex >= analyzers.length) {
            state.nextAnalyzerIndex = 0;
            state.nextBlockIndex = 0;
        }
        const analyzer = analyzers[state.nextAnalyzerIndex];
        const blocks = this.blocks.get(analyzer.id) || [];

        if (blocks.length === 0) {
            state.nextAnalyzerIndex++;
            await this.pollConnection(connectionId, connection); // Go to next analyzer immediately
            return;
        }
        
        if (state.nextBlockIndex >= blocks.length) {
            state.nextBlockIndex = 0;
            state.nextAnalyzerIndex++;
            await this.pollConnection(connectionId, connection); // Go to next analyzer immediately
            return; 
        }

        const block = blocks[state.nextBlockIndex];
        
        if (block && !block.shouldSkip()) {
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
                 if (err instanceof Error && (err.message.includes('Port Not Open') || err.message.includes('Connection is not open'))) {
                    this.handleConnectionLoss(connection);
                 }
            }
        }
        
        state.nextBlockIndex++;
    }

    private async ensureConnection(analyzer: AnalyzerSettings): Promise<ModbusConnection | null> {
        const connectionId = analyzer.getConnectionId();
        const portName = String(analyzer.portName);
        
        if (this.connections.has(connectionId)) {
            const conn = this.connections.get(connectionId)!;
            
            if(!conn.isConnected) {
                try {
                    if (this.activeReconnects.has(portName)) {
                        backendLogger.debug(`Port ${portName} already has an active reconnect process. Waiting...`, "SerialPoller");
                        return conn;
                    }
                    
                    this.activeReconnects.add(portName);
                    
                    try {
                        await conn.connect();
                        this.emit('connectionStatusChanged', { gatewayId: portName, status: 'connected', connectionId });
                    } finally {
                        setTimeout(() => this.activeReconnects.delete(portName), 5000);
                    }
                } catch(e) { /* ignore connect error, will be retried */ }
            }
            return conn;
        }

        try {
            if (this.activeReconnects.has(portName)) {
                backendLogger.debug(`Port ${portName} already has an active reconnect process. Waiting...`, "SerialPoller");
                return null;
            }
            
            this.activeReconnects.add(portName);
            
            try {
                const connection = new ModbusSerialConnection(portName, {
                    baudRate: Number(analyzer.baudRate),
                    parity: analyzer.parity,
                    stopBits: analyzer.stopBits,
                });
                
                await connection.connect();
                this.connections.set(connectionId, connection);
                this.emit('connectionStatusChanged', { gatewayId: portName, status: 'connected', connectionId });
                
                Array.from(this.connectionLossLoggedConnections.keys())
                    .filter(id => id.startsWith(portName + '@'))
                    .forEach(id => this.connectionLossLoggedConnections.delete(id));
                
                return connection;
            } finally {
                setTimeout(() => this.activeReconnects.delete(portName), 5000);
            }
        } catch (err) {
            return null;
        }
    }

    private handleConnectionLoss(connection: ModbusConnection): void {
        const connectionId = connection.connectionId;
        const portName = connectionId.split('@')[0];
        
        if (this.connectionLossLoggedConnections.has(connectionId)) {
            return;
        }
        
        this.connectionLossLoggedConnections.add(connectionId);
        
        if(this.connections.has(connectionId)) {
            this.connections.get(connectionId)?.close();
            this.connections.delete(connectionId);
        }
        
        this.emit('connectionStatusChanged', { gatewayId: portName, status: 'disconnected', connectionId });
        
        const hasActiveRegisters = this.checkActiveRegistersForConnection(portName);
        
        if (hasActiveRegisters) {
            if (!this.portReconnectTimers.has(portName)) {
                backendLogger.info(`Active registers found for serial port ${portName}. Will attempt reconnect in 30 seconds.`, "SerialPoller");
                
                const reconnectTimer = setTimeout(async () => {
                    this.portReconnectTimers.delete(portName);
                    
                    if (this.activeReconnects.has(portName)) {
                        backendLogger.info(`Port ${portName} already has an active reconnect process. Skipping duplicate reconnect.`, "SerialPoller");
                        return;
                    }
                    
                    backendLogger.info(`Connection lost for serial port ${portName}. Re-initiating polling sequence with reconnect logic.`, "SerialPoller");
                    
                    const affectedAnalyzers = Array.from(this.analyzers.values()).filter(a => a.getConnectionId().startsWith(portName + '@'));
                    if (affectedAnalyzers.length > 0) {
                        const firstAnalyzer = affectedAnalyzers[0];
                        this.connectionLossLoggedConnections.delete(firstAnalyzer.getConnectionId());
                        this.startPollingForConnection(firstAnalyzer.getConnectionId());
                    }
                    
                }, 30000);
                
                this.portReconnectTimers.set(portName, reconnectTimer);
            }
        } else {
            backendLogger.info(`No active registers for serial port ${portName}. Reconnect will not be attempted.`, "SerialPoller");
            
            const timer = this.pollingTimers.get(connectionId);
            if (timer) {
                clearTimeout(timer);
                this.pollingTimers.delete(connectionId);
                backendLogger.info(`Stopped polling for connection ${connectionId} - no active registers.`, "SerialPoller");
            }
            this.connectionLossLoggedConnections.delete(connectionId);
        }
    }

    private checkActiveRegistersForConnection(portName: string): boolean {
        for (const analyzer of this.analyzers.values()) {
            if (analyzer.portName === portName) {
                if (this.hasRegisters(analyzer.id)) {
                    return true;
                }
            }
        }
        return false;
    }

    private async loadConfiguration(): Promise<void> {
        const { db } = await connectToDatabase();
        const analyzerDocs = await db.collection('analyzers').find({ connection: 'serial' }).toArray();
        const gatewayDocs = await db.collection('gateway').find({}).toArray();
        const gatewaysById: Record<string, any> = {};
        gatewayDocs.forEach((gateway: any) => { gatewaysById[gateway._id.toString()] = gateway; });

        this.analyzers.clear();
        this.registers.clear();

        for (const doc of analyzerDocs) {
            const gateway = doc.gateway ? gatewaysById[doc.gateway.toString()] : null;
            if (!gateway) continue;

            const analyzerId = doc._id.toString();
            const analyzerConfig: AnalyzerConfig = {
                id: analyzerId, _id: analyzerId, name: doc.name,
                slaveId: parseInt(doc.slaveId) || 1, pollMs: parseInt(doc.poll) || 1000,
                timeoutMs: parseInt(doc.timeout) || 1000, connType: doc.connection,
                gatewayId: doc.gateway?.toString() || '',
                portName: gateway.port,
                baudRate: parseInt(gateway.baudRate),
                parity: gateway.parity,
                stopBits: parseInt(gateway.stopBits),
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
        const setup = async (collectionName: 'analyzers' | 'gateway', handler: (change: any) => void) => {
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
                //backendLogger.info(`Change stream for SerialPoller established for collection ${collectionName}`, "SerialPoller");
            } catch (err: any) {
                backendLogger.error(`Failed to set up change stream for ${collectionName}: ${err.message}`, "SerialPoller");
                setTimeout(() => setup(collectionName, handler), 5000);
            }
        };

        const analyzerChangeHandler = (change: any) => {
            const analyzerId = change.documentKey._id.toString();
            
            if (change.operationType === 'delete') {
                if (!this.analyzers.has(analyzerId)) {
                    return;
                }
                backendLogger.info(`Serial analyzer ${analyzerId} deleted. Processing...`, "SerialPoller");
            } else {
                const doc = change.fullDocument || change.updateDescription?.updatedFields;
                if (doc && doc.connection !== 'serial') {
                    if (this.analyzers.has(analyzerId)) {
                         this.handleAnalyzerDelete(analyzerId);
                    }
                    return;
                }
            }

            if (change.operationType === 'insert') {
                backendLogger.info(`Serial analyzer ${analyzerId} inserted. Processing...`, "SerialPoller");
                this.handleBulkUpdate(`Analyzer ${analyzerId} inserted`);
                return;
            }
            
            if (change.operationType === 'delete') {
                this.handleAnalyzerDelete(analyzerId);
                return;
            }
            
            this.handleBulkUpdate(`Analyzer ${analyzerId} updated`);
        };

        setup('gateway', () => this.handleBulkUpdate("gateway definition changed"));
        setup('analyzers', analyzerChangeHandler);
    }


    private handleAnalyzerDelete(analyzerId: string): void {
        if (this.isReloading) return;
        
        try {
            const analyzerToDelete = this.analyzers.get(analyzerId);
            if (analyzerToDelete) {
                const connectionId = analyzerToDelete.getConnectionId();
                const otherAnalyzersOnConnection = Array.from(this.analyzers.values()).some(a => a.id !== analyzerId && a.getConnectionId() === connectionId);

                // Stop the main polling timer for the connection if this is the last analyzer
                if (!otherAnalyzersOnConnection && this.pollingTimers.has(connectionId)) {
                    clearTimeout(this.pollingTimers.get(connectionId)!);
                    this.pollingTimers.delete(connectionId);
                    this.connectionPollState.delete(connectionId);
                    backendLogger.info(`Stopped polling timer for connection ${connectionId} as last analyzer was deleted.`, "SerialPoller");
                }
            }
            
            this.analyzers.delete(analyzerId);
            
            const registersToDelete = Array.from(this.registers.entries())
                .filter(([_, register]) => register.analyzerId === analyzerId)
                .map(([id, _]) => id);
            
            registersToDelete.forEach(registerId => this.registers.delete(registerId));
            this.blocks.delete(analyzerId);
            
            backendLogger.info(`Removed analyzer ${analyzerId} and ${registersToDelete.length} associated registers.`, "SerialPoller");

            // Restart polling for the connection to adjust to the change
            if (analyzerToDelete) {
                const connectionId = analyzerToDelete.getConnectionId();
                this.startPollingForConnection(connectionId);
            }
            
        } catch (err) {
            backendLogger.error(`Failed to handle serial analyzer delete for ${analyzerId}`, "SerialPoller", { error: (err as Error).message });
        }
    }

    private async handleBulkUpdate(reason: string): Promise<void> {
        if (this.isReloading) return;
        this.isReloading = true;
        try {
            //backendLogger.info(`SerialPoller is reloading configuration. Reason: ${reason}`, "SerialPoller");
            
            const oldConnections = new Map(this.connections);
            this.pollingTimers.forEach(timer => clearTimeout(timer));
            this.pollingTimers.clear();
            this.connectionPollState.clear();
            
            await this.loadConfiguration();
            this.createBlocksForAnalyzers();
            
            this.startPollingForUniqueConnections();

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

    public async updateAnalyzerRegisters(analyzerId: string): Promise<void> {
        if (this.isReloading) return;
        
        try {
            if (!this.analyzers.has(analyzerId)) {
                return;
            }

            const { db } = await connectToDatabase();
            
            const buildingsWithAnalyzer = await db.collection('buildings').find({
                $or: [
                    { "flowData.nodes.data.analyzerId": analyzerId },
                    { "floors.flowData.nodes.data.analyzerId": analyzerId },
                    { "floors.rooms.flowData.nodes.data.analyzerId": analyzerId }
                ]
            }).toArray();

            const completeRegisterList = this.loadRegistersFromBuildings(buildingsWithAnalyzer)
                                             .filter(r => r.analyzerId === analyzerId);

            const oldRegisterIds = Array.from(this.registers.keys()).filter(id =>
                this.registers.get(id)?.analyzerId === analyzerId
            );
            oldRegisterIds.forEach(id => this.registers.delete(id));

            completeRegisterList.forEach(regDoc => {
                this.registers.set(regDoc.id.toString(), new Register({ ...regDoc, _id: regDoc.id.toString() }));
            });

            const analyzerRegisters = Array.from(this.registers.values()).filter(r => r.analyzerId === analyzerId);
            this.blocks.set(analyzerId, PollerBlockFactory.makeBlocks(analyzerRegisters));

            const analyzer = this.analyzers.get(analyzerId);
            if (analyzer) {
                const connectionId = analyzer.getConnectionId();

                if (this.pollingTimers.has(connectionId)) {
                    clearTimeout(this.pollingTimers.get(connectionId)!);
                    this.pollingTimers.delete(connectionId);
                }

                this.startPollingForConnection(connectionId);
                
                backendLogger.info(`Serial analyzer '${analyzer.name}' registers updated and polling restarted. Register count: ${completeRegisterList.length}`, "SerialPoller");
            }

        } catch (err) {
            backendLogger.error(`Failed to update registers for serial analyzer ${analyzerId}`, "SerialPoller", { error: (err as Error).message });
        }
    }


    public async handleWriteRequest(payload: {
        registerId: string;
        value: number;
        analyzerId: string;
        slaveId: number;
        address: number;
        timeoutMs: number;
        scale: number;
        offset: number;
    }): Promise<void> {
        const { analyzerId, slaveId, address, value, timeoutMs, scale, offset } = payload;
        const analyzer = this.analyzers.get(analyzerId);

        if (!analyzer) {
            backendLogger.error(`Serial write failed: Analyzer ${analyzerId} not found in SerialPoller.`, "SerialPoller");
            throw new Error(`Analyzer ${analyzerId} not found.`);
        }

        const connection = this.connections.get(analyzer.getConnectionId());
        if (!connection || !connection.isConnected) {
            backendLogger.error(`Serial write failed: Connection for analyzer ${analyzerId} is not available.`, "SerialPoller");
            throw new Error(`Connection for ${analyzer.getConnectionId()} is not available.`);
        }

        try {
            // Değeri cihaza yazmadan önce ters dönüşüm uygula
            const rawValue = Math.round((value / (scale || 1)) - (offset || 0));

            backendLogger.info(`Executing serial write for ${analyzer.name}: addr=${address}, rawValue=${rawValue} (from ${value})`, "SerialPoller");
            
            // Tek bir register yazmak için `writeHoldingRegister` kullanıyoruz.
            await (connection as ModbusSerialConnection).writeHoldingRegister(slaveId, address, rawValue, timeoutMs);
            
            //backendLogger.info(`Serial write successful for analyzer ${analyzer.name}`, "SerialPoller");

        } catch (error) {
            backendLogger.error(`Serial write failed for analyzer ${analyzer.name}`, "SerialPoller", { error: (error as Error).message });
            throw error; // Hatanın yukarıya bildirilmesi için tekrar fırlat
        }
    }
}