/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/modbus/ModbusPoller.ts - The Orchestrator
import { EventEmitter } from "events";
import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import { WorkerOptions } from "worker_threads";
import { connectToDatabase } from "../mongodb";
import { backendLogger } from "../logger/BackendLogger";
import { ObjectId } from "mongodb";
import { SerialPoller } from "./SerialPoller";

const numWorkers = Math.max(1, os.cpus().length - 1);

export class ModbusPoller extends EventEmitter {
    private workers: Worker[] = [];
    private analyzerToWorker: Map<string, number> = new Map();
    private configUpdateTimeout: NodeJS.Timeout | null = null;
    private isReloading: boolean = false;
    private allKnownRegisters: Map<string, any> = new Map();
    private lastWorkerPayloads: string[] = [];
    private serialPoller: SerialPoller | null = null;

    constructor() {
        super();
    }

    public async start(): Promise<void> {
        backendLogger.info(`Orchestrator starting with ${numWorkers} worker(s).`, "ModbusPoller");
        this.createWorkers();
        
        // SerialPoller'ı başlat
        this.serialPoller = new SerialPoller();
        this.setupSerialPollerEvents();
        await this.serialPoller.start();
        
        await this.loadAndDistributeConfiguration();
        this.setupChangeStreams();
    }

    private createWorkers(): void {
        for (let i = 0; i < numWorkers; i++) {
            this.workers.push(this.createWorkerAtIndex(i));
        }
    }
    
    private createWorkerAtIndex(index: number): Worker {
        const isDev = process.env.NODE_ENV === 'development';
        
        // Geliştirme ve üretim ortamları için doğru dosya adını ve seçenekleri belirle
        const workerFilename = isDev ? 'ModbusPollerWorker.ts' : 'ModbusPollerWorker.js';
        const workerPath = path.resolve(__dirname, workerFilename);

        const workerOptions: WorkerOptions = {};
        if (isDev) {
            // Geliştirme ortamında ts-node'u kullanarak TS dosyasını çalıştır
            workerOptions.execArgv = ['-r', 'ts-node/register'];
        }

        const newWorker = new Worker(workerPath, workerOptions);
        
        newWorker.on('message', (message: { type: string, payload: any }) => {
            if (message.type === 'log') {
                const log = message.payload as any; // LogMessage tipine güveniyoruz
                backendLogger.addLog(log.level, log.message, `Worker-${index}::${log.source}`, log.details);
            } else if (message.type && message.payload) {
                this.emit(message.type, message.payload);
            }
        });

        newWorker.on('error', (err) => {
            backendLogger.error(`Worker ${index} error: ${err.message}`, "ModbusPoller", { stack: err.stack });
        });

        newWorker.on('exit', (code) => {
            backendLogger.warning(`Worker ${index} exited with code ${code}. Recreating worker...`, "ModbusPoller");
            this.workers[index] = this.createWorkerAtIndex(index);
            this.loadAndDistributeConfiguration().catch(err => {
                 backendLogger.error(`Failed to reload config for restarted worker ${index}.`, "ModbusPoller", { error: (err as Error).message });
            });
        });

        return newWorker;
    }

    private async loadAndDistributeConfiguration(): Promise<void> {
        backendLogger.info("Loading and distributing configurations to workers...", "ModbusPoller");
        try {
            const { db } = await connectToDatabase();

            const gatewayDocs = await db.collection('gateway').find({}).toArray();
            const gatewaysById: Record<string, any> = {};
            gatewayDocs.forEach(gateway => { gatewaysById[gateway._id.toString()] = gateway; });

            const analyzerDocs = await db.collection('analyzers').find({}).toArray();
            const buildingDocs = await db.collection('buildings').find({}).toArray();

            const fullAnalyzerConfigs = analyzerDocs.map(doc => {
                const gateway = doc.gateway ? gatewaysById[doc.gateway.toString()] : null;
                return {
                    id: doc._id.toString(),
                    name: doc.name,
                    slaveId: parseInt(doc.slaveId) || 1,
                    pollMs: parseInt(doc.poll) || 1000,
                    timeoutMs: parseInt(doc.timeout) || 1000,
                    connType: doc.connection,
                    gatewayId: doc.gateway?.toString() || '',
                    ip: gateway?.ipAddress,
                    port: gateway ? (doc.connection === 'tcp' ? parseInt(gateway.port) : gateway.port) : undefined,
                    baudRate: gateway ? parseInt(gateway.baudRate) : undefined,
                    parity: gateway?.parity,
                    stopBits: gateway ? parseInt(gateway.stopBits) : undefined,
                };
            });

            // TCP ve Serial analizörleri ayır
            const tcpAnalyzerConfigs = fullAnalyzerConfigs.filter(config => config.connType === 'tcp');
            const serialAnalyzerConfigs = fullAnalyzerConfigs.filter(config => config.connType === 'serial');

            backendLogger.info(`Found ${tcpAnalyzerConfigs.length} TCP analyzers and ${serialAnalyzerConfigs.length} Serial analyzers`, "ModbusPoller");

            // Serial analizörler SerialPoller tarafından yönetiliyor, sadece TCP'leri worker'lara dağıt
            const workingAnalyzerConfigs = tcpAnalyzerConfigs;
            
            const allRegisters = this.loadRegistersFromBuildings(buildingDocs);
            this.allKnownRegisters = new Map(allRegisters.map(r => [r.id, r]));

            this.analyzerToWorker.clear();
            const workerPayloads: { analyzers: any[], registers: any[] }[] = Array.from({ length: numWorkers }, () => ({ analyzers: [], registers: [] }));

            const analyzersByGateway = new Map<string, any[]>();
            // Sadece TCP analizörleri worker'lara dağıt
            workingAnalyzerConfigs.forEach(analyzer => {
                const gatewayId = analyzer.gatewayId || 'no_gateway';
                if (!analyzersByGateway.has(gatewayId)) {
                    analyzersByGateway.set(gatewayId, []);
                }
                analyzersByGateway.get(gatewayId)!.push(analyzer);
            });

            // --- Yeni Dağıtım Stratejisi: Gateway'leri Worker'lara Eşit Dağıt ---
            const gateways = Array.from(analyzersByGateway.keys());
            const workerLoads = Array.from({ length: numWorkers }, () => ({ gatewayCount: 0, analyzerCount: 0 }));
            const gatewayToWorker = new Map<string, number>();

            gateways.forEach(gatewayId => {
                // En az gateway'e sahip olan worker'ı bul
                const minLoad = Math.min(...workerLoads.map(w => w.gatewayCount));
                const targetWorkerIndex = workerLoads.findIndex(w => w.gatewayCount === minLoad);

                gatewayToWorker.set(gatewayId, targetWorkerIndex);
                const gatewayAnalyzers = analyzersByGateway.get(gatewayId) || [];
                workerLoads[targetWorkerIndex].gatewayCount++;
                workerLoads[targetWorkerIndex].analyzerCount += gatewayAnalyzers.length;

                gatewayAnalyzers.forEach(analyzerConfig => {
                    this.analyzerToWorker.set(analyzerConfig.id, targetWorkerIndex);
                    workerPayloads[targetWorkerIndex].analyzers.push(analyzerConfig);
                });
            });

            // --- Özet Worker Load Distribution ---
            const activeWorkers = workerLoads.filter((load, index) => load.gatewayCount > 0);
            const totalGateways = gateways.length;
            const totalAnalyzers = workingAnalyzerConfigs.length;
            
            if (activeWorkers.length > 0) {
                backendLogger.info(`Worker Distribution: ${activeWorkers.length}/${numWorkers} workers active, ${totalGateways} gateways, ${totalAnalyzers} analyzers`, "ModbusPoller");
                
                // Sadece aktif worker'ları detaylı logla
                activeWorkers.forEach((load, arrayIndex) => {
                    const workerIndex = workerLoads.findIndex(w => w === load);
                    const assignedGateways = gateways.filter(g => gatewayToWorker.get(g) === workerIndex);
                    backendLogger.info(`  Worker ${workerIndex}: ${load.gatewayCount} gateways, ${load.analyzerCount} analyzers`, "ModbusPoller", { gateways: assignedGateways });
                });
            } else {
                backendLogger.info(`Worker Distribution: No active workers (${totalAnalyzers} analyzers, ${totalGateways} gateways)`, "ModbusPoller");
            }
            
            // Sadece TCP analizörlerine ait register'ları worker'lara dağıt
            allRegisters.forEach(register => {
                const workerIndex = this.analyzerToWorker.get(register.analyzerId);
                if (workerIndex !== undefined) {
                    workerPayloads[workerIndex].registers.push(register);
                }
            });

            const changedWorkers: number[] = [];
            const unchangedWorkers: number[] = [];

            for (let i = 0; i < this.workers.length; i++) {
                const worker = this.workers[i];
                const newPayload = workerPayloads[i];
                const oldPayloadStr = this.lastWorkerPayloads[i] || JSON.stringify({ analyzers: [], registers: [] });
                const newPayloadStr = JSON.stringify(newPayload);

                if (newPayloadStr === oldPayloadStr) {
                    unchangedWorkers.push(i);
                    continue;
                }

                changedWorkers.push(i);

                // Senkron onay mekanizması: Worker'dan temizliğin bittiğine dair onay bekle.
                const configClearedPromise = new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        worker.removeListener('message', listener);
                        // Hata durumunda sistemi durdurmak yerine uyar ve devam et. Bu, bir worker'ın
                        // takılmasının tüm sistemi kilitlemesini engeller.
                        backendLogger.warning(`Worker ${i} did not confirm config cleared within 20s. Proceeding with caution.`, "ModbusPoller");
                        resolve(); // reject() yerine resolve() ile kararlılığı artır.
                    }, 20000); // Timeout süresini 20 saniyeye çıkararak yoğun durumlarda esneklik sağla.

                    const listener = (message: { type: string }) => {
                        if (message.type === 'CONFIG_CLEARED') {
                            clearTimeout(timeout);
                            worker.removeListener('message', listener);
                            resolve();
                        }
                    };
                    worker.on('message', listener);
                });

                // 1. ADIM: Worker'a "temizlen" komutunu gönder.
                // Payload olarak yeni konfigürasyonu göndererek hangi bağlantıların hayatta kalacağını bildir.
                worker.postMessage({ type: 'CLEAR_CONFIG', payload: newPayload });

                // 2. ADIM: Worker'dan "temizlendim" onayı gelene kadar BEKLE.
                // Bu `await` adımı, yarış durumunu (race condition) ortadan kaldıran en kritik adımdır.
                await configClearedPromise;

                // 3. ADIM: Artık worker'ın temizlendiğinden ve yeni göreve hazır olduğundan eminiz.
                // Şimdi yeni yapılandırmayı ve başlatma komutunu güvenle gönder.
                if (newPayload.analyzers.length > 0) {
                    worker.postMessage({
                        type: 'START_POLLING',
                        payload: newPayload
                    });
                }
            }

            // Özet log - sadece değişen worker sayısını göster
            if (changedWorkers.length > 0) {
                backendLogger.info(`Configuration updated: ${changedWorkers.length} workers changed, ${unchangedWorkers.length} unchanged`, "ModbusPoller");
            } else {
                backendLogger.info(`Configuration check completed: All ${unchangedWorkers.length} workers unchanged`, "ModbusPoller");
            }

            // Yeni durumu ileride karşılaştırmak için sakla
            this.lastWorkerPayloads = workerPayloads.map(p => JSON.stringify(p));

        } catch (error) {
            backendLogger.error("Failed to load and distribute configuration", "ModbusPoller", { error: (error as Error).message });
        }
    }

    private loadRegistersFromBuildings(buildings: any[]): any[] {
        const allRegisters: any[] = [];
        const findRegistersInFlowData = (flowData: any, buildingId: string, parentId: any) => {
            if (!flowData || !flowData.nodes) return [];
            return flowData.nodes
                .filter((node: any) => node.type === 'registerNode')
                .map((node: any) => ({
                    id: node.id.toString(),
                    name: node.data?.name || node.data?.label || `Register ${node.data?.address}`,
                    buildingId: buildingId,
                    parentId: parentId,
                    analyzerId: node.data?.analyzerId,
                    address: parseInt(node.data?.address) || 0,
                    dataType: node.data?.dataType,
                    scale: parseFloat(node.data?.scale) || 1,
                    byteOrder: node.data?.byteOrder,
                    bit: node.data?.bit || 0,
                    registerType: node.data?.registerType || 'read', // 'read' veya 'write'
                    writeFunctionCode: node.data?.writeFunctionCode || 'FC06',
                    controlType: node.data?.controlType || 'dropdown'
                }));
        };
        buildings.forEach((building: any) => {
            const buildingId = building._id.toString();
            if (building.flowData) {
                allRegisters.push(...findRegistersInFlowData(building.flowData, buildingId, `building_${buildingId}`));
            }
            if (building.floors) {
                building.floors.forEach((floor: any) => {
                    const floorId = floor._id ? floor._id.toString() : floor.id;
                    if (floor.flowData) {
                        allRegisters.push(...findRegistersInFlowData(floor.flowData, buildingId, `floor_${floorId}`));
                    }
                    if (floor.rooms) {
                        floor.rooms.forEach((room: any) => {
                            const roomId = room._id ? room._id.toString() : room.id;
                            if (room.flowData) {
                                allRegisters.push(...findRegistersInFlowData(room.flowData, buildingId, `room_${roomId}`));
                            }
                        });
                    }
                });
            }
        });
        return allRegisters;
    }

    private setupChangeStreams(): void {
        const setup = async (collectionName: 'buildings' | 'analyzers' | 'gateway', handler: (change: any) => void) => {
            try {
                const { db } = await connectToDatabase();
                const changeStream = db.collection(collectionName).watch([], { fullDocumentBeforeChange: "whenAvailable" });
                changeStream.on("change", (change) => {
                    if (this.configUpdateTimeout) clearTimeout(this.configUpdateTimeout);
                    this.configUpdateTimeout = setTimeout(() => handler(change), 1000);
                });
                changeStream.on('error', (err) => {
                    backendLogger.error(`Change stream error for ${collectionName}: ${err}`, "ModbusPoller");
                    setTimeout(() => setup(collectionName, handler), 5000);
                });
                backendLogger.info(`Change stream established for collection ${collectionName}`, "ModbusPoller");
            } catch (err) {
                backendLogger.error(`Failed to set up change stream for ${collectionName}: ${err}`, "ModbusPoller");
                setTimeout(() => setup(collectionName, handler), 5000);
            }
        };

        const bulkUpdateHandler = (change: any) => {
            backendLogger.info(`Major config change detected in ${change.ns.coll}. Reloading all workers.`, "ModbusPoller");
            this.handleBulkUpdate().catch(err => {
                 backendLogger.error(`Error handling bulk update`, "ModbusPoller", { error: (err as Error).message });
            });
        };
        
        const buildingChangeHandler = async (change: any) => {
            if (change.operationType === 'update' && change.updateDescription.updatedFields) {
                const buildingId = change.documentKey._id;
                
                // Change stream belirsizliğinden kaçınmak için en güvenilir yol:
                // Değişiklik öncesi ve sonrası durumu karşılaştır.
                const oldRegisters = Array.from(this.allKnownRegisters.values()).filter(r => r.buildingId === buildingId.toString());

                const { db } = await connectToDatabase();
                const changedBuildingDoc = await db.collection('buildings').findOne({ _id: buildingId });
                const newRegisters = changedBuildingDoc ? this.loadRegistersFromBuildings([changedBuildingDoc]) : [];

                // Karşılaştırma için register'ları basitleştirilmiş bir formata getir (sadece kritik alanlar).
                const toComparableString = (r: any) => `${r.id}|${r.analyzerId}|${r.address}|${r.dataType}|${r.byteOrder}|${r.scale}|${r.bit}`;

                const oldComparable = oldRegisters.map(toComparableString).sort().join(',');
                const newComparable = newRegisters.map(toComparableString).sort().join(',');

                if (oldComparable !== newComparable) {
                    //backendLogger.info(`Critical building change detected (register data modified). Attempting surgical update.`, "ModbusPoller", { buildingId });
                    this.handleBuildingChange(buildingId).catch(err => {
                        backendLogger.error(`Error handling building change for ${buildingId}`, "ModbusPoller", { error: (err as Error).message });
                    });
                } else {
                    //backendLogger.debug(`Non-critical building change detected (likely position or style). Skipping poller update.`, "ModbusPoller", { buildingId });
                }
            } else if (change.operationType === 'delete') {
                // Bina silindiğinde özel işleme
                const buildingId = change.documentKey._id.toString();
                
                // Silinen binanın tüm register'larını bul
                const oldRegisters = Array.from(this.allKnownRegisters.values())
                    .filter(r => r.buildingId === buildingId);
                
                // Etkilenen analizörleri belirle
                const involvedAnalyzerIds = new Set<string>();
                oldRegisters.forEach(r => r.analyzerId && involvedAnalyzerIds.add(r.analyzerId));
                
                // Register'ları internal cache'den kaldır
                oldRegisters.forEach(r => this.allKnownRegisters.delete(r.id));
                
                backendLogger.info(`Building deleted: ${buildingId}, removed ${oldRegisters.length} registers affecting ${involvedAnalyzerIds.size} analyzers`, "ModbusPoller");
                
                // Etkilenen tüm analizörler için worker'ları güncelle
                for (const analyzerId of involvedAnalyzerIds) {
                    if (!analyzerId) continue;
                    
                    // Analizörün serial olup olmadığını kontrol et
                    try {
                        const { db } = await connectToDatabase();
                        const analyzerDoc = await db.collection('analyzers').findOne({ _id: new ObjectId(analyzerId) });
                        
                        if (analyzerDoc?.connection === 'serial') {
                            if (this.serialPoller) {
                                this.serialPoller.updateAnalyzerRegisters(analyzerId).catch(err => {
                                    backendLogger.error(`Failed to send update to SerialPoller for ${analyzerId}`, "ModbusPoller", { error: (err as Error).message });
                                });
                            }
                            continue; // Sonraki analizöre geç
                        }
                        
                        // TCP analizörleri için, güncellenen internal cache'den tam liste oluştur
                        const completeRegisterList = Array.from(this.allKnownRegisters.values())
                            .filter(r => r.analyzerId === analyzerId);
                        
                        const workerIndex = this.analyzerToWorker.get(analyzerId);
                        if (workerIndex !== undefined) {
                            const worker = this.workers[workerIndex];
                            worker.postMessage({
                                type: 'UPDATE_ANALYZER_REGISTERS',
                                payload: {
                                    analyzerId: analyzerId,
                                    registers: completeRegisterList
                                }
                            });
                            backendLogger.info(`Sent update to worker ${workerIndex} for analyzer ${analyzerId} after building deletion. New register count: ${completeRegisterList.length}`, "ModbusPoller");
                        } else {
                            backendLogger.warning(`Surgical update skipped: TCP Analyzer ${analyzerId} is not assigned to any worker.`, "ModbusPoller");
                        }
                    } catch (err) {
                        backendLogger.error(`Failed to update analyzer ${analyzerId} after building deletion`, "ModbusPoller", { error: (err as Error).message });
                    }
                }
            } else {
                // 'insert' gibi diğer işlemler topyekün güncellemeyi tetikler.
                bulkUpdateHandler(change);
            }
        };

        const analyzerChangeHandler = async (change: any) => {
            const analyzerId = change.documentKey._id.toString();

            // Analizörün connection type'ını belirle
            let connectionType = 'tcp'; // default
            if (change.fullDocument) {
                connectionType = change.fullDocument.connection || 'tcp';
            } else if (change.operationType === 'update') {
                // Update durumunda veritabanından connection type'ı al
                try {
                    const { db } = await connectToDatabase();
                    const analyzer = await db.collection('analyzers').findOne({ _id: change.documentKey._id });
                    connectionType = analyzer?.connection || 'tcp';
                } catch (err) {
                    backendLogger.warning(`Could not determine connection type for analyzer ${analyzerId}, defaulting to tcp`, "ModbusPoller");
                }
            } else if (change.operationType === 'delete') {
                // Delete durumunda fullDocumentBeforeChange'den connection type'ı al
                if (change.fullDocumentBeforeChange) {
                    connectionType = change.fullDocumentBeforeChange.connection || 'tcp';
                } else {
                    // fullDocumentBeforeChange yoksa, analizörün hangi poller tarafından yönetildiğini kontrol et
                    // SerialPoller kendi analyzer listesinde varsa serial, yoksa tcp
                    backendLogger.debug(`No fullDocumentBeforeChange for deleted analyzer ${analyzerId}. Using fallback detection.`, "ModbusPoller");
                    connectionType = 'tcp'; // Default olarak tcp kabul et, SerialPoller kendi kontrolünü yapacak
                }
            }

            if (change.operationType === 'delete') {
                // fullDocumentBeforeChange varsa connection type'a göre karar ver
                if (change.fullDocumentBeforeChange) {
                    if (connectionType === 'tcp') {
                        backendLogger.info(`TCP Analyzer ${analyzerId} deleted. Triggering bulk update.`, "ModbusPoller");
                        bulkUpdateHandler(change);
                    } else {
                        backendLogger.debug(`Serial analyzer ${analyzerId} deleted. Managed by SerialPoller.`, "ModbusPoller");
                    }
                } else {
                    // fullDocumentBeforeChange yoksa, her iki poller da kendi kontrolünü yapsın
                    // SerialPoller kendi analyzer listesinde varsa işleyecek, yoksa skip edecek
                    // ModbusPoller da analyzerToWorker map'inde varsa işleyecek, yoksa skip edecek
                    const isInWorkerMap = this.analyzerToWorker.has(analyzerId);
                    if (isInWorkerMap) {
                        backendLogger.info(`TCP Analyzer ${analyzerId} deleted (fallback detection). Triggering bulk update.`, "ModbusPoller");
                        bulkUpdateHandler(change);
                    } else {
                        backendLogger.debug(`Analyzer ${analyzerId} deleted but not in TCP worker map. Likely serial, managed by SerialPoller.`, "ModbusPoller");
                    }
                }
                
            } else if (change.operationType === 'insert') {
                // INSERT işlemi için connection type kontrolü yap
                if (connectionType === 'tcp') {
                    backendLogger.info(`TCP Analyzer ${analyzerId} inserted. Triggering bulk update.`, "ModbusPoller");
                    bulkUpdateHandler(change);
                } else {
                    // Serial analizör eklendi - SerialPoller kendi change stream'i ile yönetiyor
                    backendLogger.debug(`Serial analyzer ${analyzerId} inserted. Managed by SerialPoller.`, "ModbusPoller");
                }
            } else if (change.operationType === 'update' && change.updateDescription.updatedFields.gateway) {
                // Gateway değişti - bu durumda her zaman bulk update gerekli
                backendLogger.info(`Analyzer ${analyzerId} gateway changed. Triggering bulk update.`, "ModbusPoller");
                bulkUpdateHandler(change);
            } else if (change.operationType === 'update') {
                // Sadece TCP analizörleri için property change işle
                if (connectionType === 'tcp') {
                    const updatedFields = change.updateDescription.updatedFields;
                    const newProps: { pollMs?: number, timeoutMs?: number } = {};
                    if (updatedFields.poll) newProps.pollMs = parseInt(updatedFields.poll);
                    if (updatedFields.timeout) newProps.timeoutMs = parseInt(updatedFields.timeout);

                    if (Object.keys(newProps).length > 0) {
                        this.handleAnalyzerPropertyChange(analyzerId, newProps);
                    }
                } else {
                    // Serial analizör güncellendi - SerialPoller kendi change stream'i ile yönetiyor
                    backendLogger.debug(`Serial analyzer ${analyzerId} updated. Managed by SerialPoller.`, "ModbusPoller");
                }
            }
        };

        setup('analyzers', analyzerChangeHandler);
        setup('gateway', bulkUpdateHandler);
        setup('buildings', buildingChangeHandler);
    }

    private async handleBulkUpdate(): Promise<void> {
        if (this.isReloading) return;
        this.isReloading = true;
        try {
            await this.loadAndDistributeConfiguration();
        } catch (err) {
             backendLogger.error("Failed to process bulk update.", "ModbusPoller", { error: (err as Error).message });
        } finally {
            this.isReloading = false;
        }
    }
    
    private async handleBuildingChange(buildingId: ObjectId): Promise<void> {
        if (this.isReloading) return;
        this.isReloading = true;
    
        try {
            const { db } = await connectToDatabase();
            
            // 1. Get old and new register states for the specific building
            const oldRegistersInBuilding = Array.from(this.allKnownRegisters.values()).filter(r => r.buildingId === buildingId.toString());
            const changedBuildingDoc = await db.collection('buildings').findOne({ _id: buildingId });
            const newRegistersInBuilding = changedBuildingDoc ? this.loadRegistersFromBuildings([changedBuildingDoc]) : [];
    
            // 2. Determine all involved analyzer IDs from both old and new states
            const involvedAnalyzerIds = new Set<string>();
            oldRegistersInBuilding.forEach(r => r.analyzerId && involvedAnalyzerIds.add(r.analyzerId));
            newRegistersInBuilding.forEach(r => r.analyzerId && involvedAnalyzerIds.add(r.analyzerId));
    
            // 3. Immediately update the orchestrator's master register list (`allKnownRegisters`)
            // This ensures internal state is consistent before notifying workers.
            oldRegistersInBuilding.forEach(r => this.allKnownRegisters.delete(r.id));
            newRegistersInBuilding.forEach(r => this.allKnownRegisters.set(r.id, r));
            backendLogger.debug(`Updated internal cache: ${oldRegistersInBuilding.length} registers removed, ${newRegistersInBuilding.length} added.`, "ModbusPoller");
    
            // 4. For each affected analyzer, send the new *complete* state to the worker
            for (const analyzerId of involvedAnalyzerIds) {
                if (!analyzerId) continue;
    
                // Check if the analyzer is serial; if so, delegate to SerialPoller
                const analyzerDoc = await db.collection('analyzers').findOne({ _id: new ObjectId(analyzerId) });
                if (analyzerDoc?.connection === 'serial') {
                    if (this.serialPoller) {
                        this.serialPoller.updateAnalyzerRegisters(analyzerId).catch(err => {
                            backendLogger.error(`Failed to send update to SerialPoller for ${analyzerId}`, "ModbusPoller", { error: (err as Error).message });
                        });
                    }
                    continue; // Skip to the next analyzer
                }
    
                // For TCP analyzers, build the complete list from the updated internal cache
                const completeRegisterList = Array.from(this.allKnownRegisters.values())
                                                  .filter(r => r.analyzerId === analyzerId);
    
                const workerIndex = this.analyzerToWorker.get(analyzerId);
                if (workerIndex !== undefined) {
                    const worker = this.workers[workerIndex];
                    worker.postMessage({
                        type: 'UPDATE_ANALYZER_REGISTERS',
                        payload: {
                            analyzerId: analyzerId,
                            registers: completeRegisterList
                        }
                    });
                    backendLogger.info(`Sent updated state for analyzer ${analyzerId} to worker ${workerIndex}. New register count: ${completeRegisterList.length}`, "ModbusPoller");
                } else {
                    backendLogger.warning(`Surgical update ignored: TCP Analyzer ${analyzerId} is not assigned to any worker.`, "ModbusPoller");
                }
            }
        } catch (err) {
            backendLogger.error(`Failed to process surgical building change for ${buildingId}. Falling back to bulk update.`, "ModbusPoller", { error: (err as Error).message });
            await this.handleBulkUpdate();
        } finally {
            this.isReloading = false;
        }
    }

    /**
     * SerialPoller event'lerini ana sisteme yönlendirir
     */
    private setupSerialPollerEvents(): void {
        if (!this.serialPoller) return;

        // SerialPoller'dan gelen register güncellemelerini ana sisteme yönlendir
        this.serialPoller.on('registerUpdated', (payload) => {
            this.emit('registerUpdated', payload);
        });

        // SerialPoller'dan gelen bağlantı durumu değişikliklerini ana sisteme yönlendir
        this.serialPoller.on('connectionStatusChanged', (payload) => {
            this.emit('connectionStatusChanged', payload);
        });

        backendLogger.info("SerialPoller events configured successfully.", "ModbusPoller");
    }

    private handleAnalyzerPropertyChange(analyzerId: string, newProps: { pollMs?: number, timeoutMs?: number }): void {
        const workerIndex = this.analyzerToWorker.get(analyzerId);
        if (workerIndex === undefined) {
            backendLogger.error(`Cannot apply property change. Analyzer ${analyzerId} is not assigned to any worker.`, "ModbusPoller");
            return;
        }
        
        const worker = this.workers[workerIndex];
        //backendLogger.info(`Sending surgical property update for analyzer ${analyzerId} to worker ${workerIndex}.`, "ModbusPoller");
        worker.postMessage({
            type: 'UPDATE_ANALYZER_PROPERTIES',
            payload: {
                analyzerId: analyzerId,
                newProps: newProps
            }
        });
    }


    public async handleWriteRequest(registerId: string, value: number): Promise<void> {
        const register = this.allKnownRegisters.get(registerId);
        if (!register) {
            backendLogger.error(`Write request failed: Register ${registerId} not found in orchestrator cache.`, "ModbusPoller");
            throw new Error(`Register with ID ${registerId} not found.`);
        }

        const analyzerId = register.analyzerId;
        const analyzerInfo = await this.findAnalyzerById(analyzerId);

        if (!analyzerInfo) {
            backendLogger.error(`Write request failed: Analyzer ${analyzerId} for register ${registerId} not found.`, "ModbusPoller");
            throw new Error(`Analyzer with ID ${analyzerId} not found.`);
        }

        if (analyzerInfo.connType === 'serial') {
            // SerialPoller eski payload yapısını bekliyor, ona uygun gönder.
            const serialPayload = {
                registerId,
                value,
                analyzerId,
                slaveId: analyzerInfo.slaveId,
                address: register.address,
                timeoutMs: analyzerInfo.timeoutMs,
                scale: register.scale,
                offset: register.offset,
            };
            if (this.serialPoller) {
                backendLogger.info(`Forwarding write request to SerialPoller for analyzer ${analyzerId}`, "ModbusPoller");
                await this.serialPoller.handleWriteRequest(serialPayload as any); // cast as any to bypass strict type check for now
            } else {
                backendLogger.error("SerialPoller is not initialized. Cannot handle write request.", "ModbusPoller");
                throw new Error("SerialPoller is not available.");
            }
        } else { // TCP
            // PollingEngine'in encode metodunu kullanabilmesi için tüm register nesnesini gönderiyoruz.
            const tcpPayload = {
                register, // The whole register object
                value,
                analyzerId, // Keep for convenience
                slaveId: analyzerInfo.slaveId,
                timeoutMs: analyzerInfo.timeoutMs
            };
            const workerIndex = this.analyzerToWorker.get(analyzerId);
            if (workerIndex === undefined) {
                backendLogger.error(`Cannot handle write request. TCP Analyzer ${analyzerId} is not assigned to any worker.`, "ModbusPoller");
                throw new Error(`TCP Analyzer ${analyzerId} is not assigned to a worker.`);
            }
            const worker = this.workers[workerIndex];
            backendLogger.info(`Forwarding write request to worker ${workerIndex} for analyzer ${analyzerId}`, "ModbusPoller");
            worker.postMessage({
                type: 'WRITE_REGISTER',
                payload: tcpPayload
            });
        }
    }

    /**
     * Analyzer ID'ye göre analyzer bilgilerini bulur
     */
    private async findAnalyzerById(analyzerId: string): Promise<any> {
        try {
            const { db } = await connectToDatabase();
            const analyzer = await db.collection('analyzers').findOne({ _id: new ObjectId(analyzerId) });
            
            if (!analyzer) {
                return null;
            }

            // gateway bilgilerini de al
            let gateway = null;
            if (analyzer.gateway) {
                gateway = await db.collection('gateway').findOne({ _id: analyzer.gateway });
            }

            return {
                id: analyzer._id.toString(),
                connType: analyzer.connection,
                slaveId: parseInt(analyzer.slaveId) || 1,
                timeoutMs: parseInt(analyzer.timeout) || 5000,
                gatewayId: analyzer.gateway?.toString(),
                ip: gateway?.ipAddress,
                port: gateway?.port,
                portName: gateway?.port,
                baudRate: gateway ? parseInt(gateway.baudRate) : undefined,
                parity: gateway?.parity,
                stopBits: gateway ? parseInt(gateway.stopBits) : undefined,
            };
        } catch (error) {
            backendLogger.error(`Error finding analyzer ${analyzerId}`, "ModbusPoller", { error: (error as Error).message });
            return null;
        }
    }

}
