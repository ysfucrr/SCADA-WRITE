import { connectToDatabase } from "./mongodb";
import { backendLogger } from './logger/BackendLogger';
import { ObjectId } from "mongodb";
import { redisClient } from "./redis";

// This map will hold trend definitions, and the service will react to events
// Key format: "registerId:analyzerId" to support multiple analyzers for same register
const activeTrendLoggers = new Map<string, TrendLogger>();
// This map will cache the latest value for every register received from the poller
const lastKnownValues = new Map<string, number>();
// Veritabanına en son kaydedilen değeri her bir logger için ayrı ayrı tutar.
// Key: "registerId:analyzerId", Value: number
const lastStoredValuesPerLogger = new Map<string, number>();

export class TrendLoggerService {
    public isShuttingDown: boolean = false;
    private configUpdateTimeout: number | null = null;


    constructor() {
        backendLogger.info("[TREND-LOGGER] Service created", "TrendLoggerService");
        this.setupShutdownHandlers();
        this.setupRedisSubscriptions();
        this.listenForDbChanges();
        this.ensureCollectionsExist();
    }
    
    // Gerekli koleksiyonların ve indekslerin varlığını kontrol et
    private async ensureCollectionsExist() {
        try {
            const { db } = await connectToDatabase();
            
            // Koleksiyonların listesini al
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map((c: any) => c.name);

            // 'trend_log_entries' koleksiyonunu kontrol et ve optimize et
            if (!collectionNames.includes('trend_log_entries')) {
                await db.createCollection('trend_log_entries', {
                    storageEngine: {
                        wiredTiger: {
                            configString: 'block_compressor=zstd'
                        }
                    }
                });
                backendLogger.info('Created trend_log_entries collection with zstd compression', 'TrendLoggerService');
            }
            
            // onChange trend logları için koleksiyon yoksa oluştur
            if (!collectionNames.includes('trend_log_entries_onchange')) {
                // Koleksiyonu 'zstd' sıkıştırmasıyla oluştur
                await db.createCollection('trend_log_entries_onchange', {
                    storageEngine: {
                        wiredTiger: {
                            configString: 'block_compressor=zstd'
                        }
                    }
                });
                backendLogger.info('Created trend_log_entries_onchange collection with zstd compression', 'TrendLoggerService');

                // TTL indeksi oluştur
                await db.collection('trend_log_entries_onchange').createIndex(
                    { expiresAt: 1 },
                    { expireAfterSeconds: 0, name: 'expiresAt_ttl_index' }
                );
                backendLogger.info('Created TTL index on trend_log_entries_onchange collection', 'TrendLoggerService');

                // Mevcut onChange loglarını migrasyon yap
                await this.migrateExistingOnChangeTrendLogs();
            }
        } catch (error) {
            backendLogger.error('Error ensuring collections exist', 'TrendLoggerService', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    
    // Mevcut onChange trend loglarını güncelleme
    private async migrateExistingOnChangeTrendLogs() {
        try {
            const { db } = await connectToDatabase();
            
            // onChange modundaki tüm trend logları bul (cleanupPeriod alanı olmayanlar)
            const onChangeTrendLogs = await db.collection('trendLogs')
                .find({ period: 'onChange', cleanupPeriod: { $exists: false } })
                .toArray();
                
            if (onChangeTrendLogs.length === 0) {
                backendLogger.info('No onChange trend logs need migration', 'TrendLoggerService');
                return;
            }
            
            backendLogger.info(`Found ${onChangeTrendLogs.length} onChange trend logs to migrate`, 'TrendLoggerService');
            
            // Her birine varsayılan cleanupPeriod ekle (3 ay)
            const updateOperations = onChangeTrendLogs.map((log: any) => ({
                updateOne: {
                    filter: { _id: log._id },
                    update: { $set: { cleanupPeriod: 3 } } // Varsayılan: 3 ay
                }
            }));
            
            // Toplu güncelleme yap
            const result = await db.collection('trendLogs').bulkWrite(updateOperations);
            backendLogger.info(`Migration completed: ${result.modifiedCount} trend logs updated`, 'TrendLoggerService');
            
        } catch (error) {
            backendLogger.error('Error during onChange trend logs migration', 'TrendLoggerService', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private setupRedisSubscriptions(): void {
        // No need to set up event handlers here, as they are now handled in redis.ts
        // This method is kept for backward compatibility and potential future Redis-specific subscriptions
        backendLogger.info("[TREND-LOGGER] Redis subscription setup delegated to redis.ts", "TrendLoggerService");
    }

    private setupShutdownHandlers(): void {
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGUSR2', () => this.shutdown('SIGUSR2'));
    }

    public async shutdown(signal: string): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        backendLogger.info(`[TREND-LOGGER] Service shutting down (${signal})...`, "TrendLoggerService");

        const savePromises: Promise<void>[] = [];
        for (const trendLogger of activeTrendLoggers.values()) {
            const lastValue = lastKnownValues.get(trendLogger.registerId);
            if (lastValue !== undefined) {
                savePromises.push(trendLogger.storeRegisterValue(lastValue).catch(err => {
                    backendLogger.error(`[TREND-LOGGER] Error saving ${trendLogger._id}: ` + (err instanceof Error ? err.message : String(err)), "TrendLoggerService");
                }));
            }
        }

        if (savePromises.length > 0) {
            await Promise.allSettled(savePromises);
            backendLogger.info(`[TREND-LOGGER] Saved last values for ${savePromises.length} trend loggers`, "TrendLoggerService");
        }

        if (['SIGTERM', 'SIGINT'].includes(signal)) {
            process.exit(0);
        }
    }
    
    private async listenForDbChanges() {
        try {
            const { db } = await connectToDatabase();
            const changeStream = db.collection('trendLogs').watch();

            changeStream.on('change', (change) => {
                //backendLogger.info('Change detected in trendLogs collection, reloading definitions.', 'TrendLoggerService', { changeType: change.operationType });
                if (this.configUpdateTimeout) {
                    clearTimeout(this.configUpdateTimeout);
                }
                this.configUpdateTimeout = setTimeout(() => {
                    this.loadAllTrendLoggers();
                }, 500) as any; // 500ms debounce window
            });
            //backendLogger.info('Watching trendLogs collection for changes.', 'TrendLoggerService');
        } catch (error) {
            backendLogger.error('Failed to set up watch on trendLogs collection.', 'TrendLoggerService', { error: (error as Error).message });
        }
    }

    public initialize(): this {
        this.loadAllTrendLoggers().catch(err => {
            backendLogger.error(`[TREND-LOGGER] Error loading trend loggers: ` + (err instanceof Error ? err.message : String(err)), "TrendLoggerService");
        });
        return this;
    }

    public listenToPoller(poller: import('./modbus/ModbusPoller').ModbusPoller): void {
        poller.on('registerUpdated', (data: { id: string; value: number; analyzerId?: string }) => {
            // Analyzer ID'si ile birlikte kaydet
            const valueMapKey = `${data.id}:${data.analyzerId || 'default'}`;
            lastKnownValues.set(valueMapKey, data.value);
            
            // Geriye dönük uyumluluk için sadece register ID'si ile de kaydet
            lastKnownValues.set(data.id, data.value);

            // Try to find logger for this specific register+analyzer combination
            let trendLogger = activeTrendLoggers.get(`${data.id}:${data.analyzerId}`);

            // If not found with analyzerId, try just registerId for backward compatibility
            if (!trendLogger) {
                trendLogger = activeTrendLoggers.get(data.id);
            }

            if (trendLogger) {
                const now = new Date();
                
                // Check if the endDate has passed
                if (trendLogger.endDate && now > trendLogger.endDate) {
                    // Optional: Mark as 'stopped' in DB or simply remove from active loggers
                    const mapKey = `${data.id}:${data.analyzerId}`;
                    activeTrendLoggers.delete(mapKey);
                    backendLogger.info(`Trend logger stopped as endDate has passed for register ${data.id} (analyzer: ${data.analyzerId}).`, 'TrendLoggerService');
                    return; // Stop processing for this logger
                }

                if (trendLogger.period === 'onChange') {
                    const mapKey = `${data.id}:${data.analyzerId}`;
                    const lastStoredValue = lastStoredValuesPerLogger.get(mapKey);
                    
                    // Değer aynı değilse
                    const valueChanged = data.value !== lastStoredValue;
                    if (valueChanged) {
                        // KWH Counter ise doğrudan kaydet, değilse yüzde eşiği kontrolü yap
                        if (trendLogger.isKWHCounter) {
                            trendLogger.storeRegisterValue(data.value);
                        } else {
                            // Yüzde eşiği aşıldı mı kontrol et (ya da ilk değer ise)
                            const thresholdExceeded = trendLogger.hasPercentageThresholdExceeded(data.value, lastStoredValue);
                            
                            if (thresholdExceeded) {
                                trendLogger.storeRegisterValue(data.value);
                            }
                        }
                    }
                } else {
                    const intervalMs = trendLogger.getIntervalMs();
                    if (now.getTime() - trendLogger.lastSaveTimestamp >= intervalMs) {
                        trendLogger.storeRegisterValue(data.value);
                        trendLogger.lastSaveTimestamp = now.getTime();
                    }
                }
            }
        });
    }

    public async loadAllTrendLoggers() {
        // Trend logger tanımlarını yükle
        const { db } = await connectToDatabase();
        const trendLogs = await db.collection('trendLogs').find({ status: { $ne: 'stopped' } }).toArray();
        
        const newConfigMap = new Map<string, TrendLogger>();

        for (const trendLog of trendLogs) {
            const registerId = trendLog.registerId;
            const analyzerId = trendLog.analyzerId;
            const mapKey = `${registerId}:${analyzerId}`;

            const newLogger = new TrendLogger(
                trendLog._id.toString(),
                registerId,
                analyzerId,
                trendLog.period,
                trendLog.interval,
                trendLog.endDate,
                trendLog.cleanupPeriod,  // onChange için otomatik temizleme süresi
                trendLog.percentageThreshold,  // onChange için yüzde eşiği
                trendLog.isKWHCounter  // KWH Counter flag
            );

            const existingLogger = activeTrendLoggers.get(mapKey);

            // If a logger for this register+analyzer combination already exists and its timing is unchanged, preserve its last save time and last value
            // to avoid resetting the schedule and to maintain onChange comparison
            if (existingLogger && existingLogger.period === newLogger.period && existingLogger.interval === newLogger.interval) {
                newLogger.lastSaveTimestamp = existingLogger.lastSaveTimestamp;
            }

            newConfigMap.set(mapKey, newLogger);
        }
        
        // Atomically update the active loggers map.
        activeTrendLoggers.clear();
        newConfigMap.forEach((value, key) => {
            activeTrendLoggers.set(key, value);
        });

        // onChange modundaki logger'lar için son kaydedilen değerleri yükle
        // Bu artık activeTrendLoggers doldurulduktan SONRA çağrılıyor
        await this.loadLastStoredValuesForOnChangeLoggers();

        // Logger tanımları yüklendi
    }

    public getLastKnownValue(registerId: string, analyzerId?: string): number | undefined {
        // Önce analizör ID'si ile birlikte kontrol et
        if (analyzerId) {
            const valueWithAnalyzer = lastKnownValues.get(`${registerId}:${analyzerId}`);
            if (valueWithAnalyzer !== undefined) {
                return valueWithAnalyzer;
            }
        }
        // Geriye dönük uyumluluk için sadece register ID ile de kontrol et
        return lastKnownValues.get(registerId);
    }

    // onChange modundaki logger'lar için son kaydedilen değerleri MongoDB'den yükle
    private async loadLastStoredValuesForOnChangeLoggers() {
        try {
            const { db } = await connectToDatabase();
            const onChangeLoggers = Array.from(activeTrendLoggers.values()).filter(
                logger => logger.period === 'onChange'
            );

            if (onChangeLoggers.length === 0) {
                return; // Hiç onChange logger yoksa işlem yapmaya gerek yok
            }


            // Her logger için en son değeri al
            for (const logger of onChangeLoggers) {
                const latestEntry = await db.collection('trend_log_entries_onchange')
                    .find({
                        trendLogId: new ObjectId(logger._id),
                        registerId: logger.registerId,
                        analyzerId: logger.analyzerId
                    })
                    .sort({ timestamp: -1 })
                    .limit(1)
                    .toArray();

                if (latestEntry.length > 0) {
                    const mapKey = `${logger.registerId}:${logger.analyzerId}`;
                    const lastValue = latestEntry[0].value;
                    
                    // Son değeri haritaya kaydet
                    lastStoredValuesPerLogger.set(mapKey, lastValue);
                    
                    // Ayrıca Redis'e de kaydet (eğer mevcutsa)
                    if (redisClient.isReady) {
                        try {
                            await redisClient.set(`trendlog:lastvalue:${logger.registerId}:${logger.analyzerId}`, lastValue.toString());
                        } catch (redisError) {
                            backendLogger.debug(`[TREND-LOGGER] Redis error setting last value reference: ${redisError}`, "TrendLogger");
                        }
                    }
                }
            }
        } catch (error) {
            backendLogger.error(`[TREND-LOGGER] Son değerleri yükleme hatası: ${error instanceof Error ? error.message : String(error)}`, "TrendLoggerService");
        }
    }
}

export interface TrendLogType {
    _id: string;
    analyzerId: string;
    registerId: string;
    period: string;
    interval: number;
    endDate: string;
    address: number;
    dataType: string;
    byteOrder: string;
    scale: number;
}

class TrendLogger {
    _id: string;
    registerId: string;
    analyzerId: string;
    period: string;
    interval: number;
    endDate?: Date; // endDate is now a Date object and optional
    lastSaveTimestamp: number = 0;
    cleanupPeriod?: number; // Ay cinsinden otomatik temizleme süresi (onChange modunda kullanılır)
    percentageThreshold?: number; // Yüzde eşiği (onChange modunda kullanılır)
    isKWHCounter?: boolean; // KWH Counter flag
    
    constructor(_id: string, registerId: string, analyzerId: string, period: string, interval: number, endDate?: string | Date, cleanupPeriod?: number, percentageThreshold?: number, isKWHCounter?: boolean) {
        this._id = _id;
        this.registerId = registerId;
        this.analyzerId = analyzerId;
        this.period = period;
        this.interval = interval;
        this.lastSaveTimestamp = Date.now(); // Prime the timestamp to prevent immediate logging
        if (endDate) {
            this.endDate = new Date(endDate);
        }
        this.cleanupPeriod = cleanupPeriod;
        this.percentageThreshold = percentageThreshold;
        this.isKWHCounter = isKWHCounter;
    }

    getIntervalMs(): number {
        const periodLower = this.period.toLowerCase();
        switch (periodLower) {
            case 'second':
                return this.interval * 1000;
            case 'minute':
                return this.interval * 60 * 1000;
            case 'hour':
                return this.interval * 60 * 60 * 1000;
            case 'day':
                return this.interval * 24 * 60 * 60 * 1000;
            case 'week':
                return this.interval * 7 * 24 * 60 * 60 * 1000;
            case 'month':
                return this.interval * 30 * 24 * 60 * 60 * 1000; // 30 gün olarak hesapla
            default:
                return this.interval * 60 * 1000;
        }
    }

    // Yüzde eşiği aşıldı mı kontrol et
    public hasPercentageThresholdExceeded(currentValue: number, lastStoredValue: number | undefined): boolean {
        // if `lastStoredValue` is not set (it's the first time), or percentage threshold is not defined, always save.
        if (lastStoredValue === undefined || !this.percentageThreshold) {
            return true;
        }

        // If the last stored value is 0, any change should be recorded.
        if (lastStoredValue === 0) {
            return currentValue !== 0;
        }
        
        // Doğrudan yüzde değişimini hesapla
        const percentChange = Math.abs((currentValue - lastStoredValue) / lastStoredValue * 100);
        
        // Yüzde değişimi, belirlenen eşik yüzdesiyle doğrudan karşılaştır
        return percentChange >= this.percentageThreshold;
    }

    async storeRegisterValue(value: number | null) {
        if (value === null || value === undefined) {
            return;
        }
        
        const now = new Date();
        let expiresAt: Date | undefined = undefined;
        
        // Eğer onChange modunda ve cleanupPeriod tanımlanmışsa son kullanma tarihi hesapla
        if (this.period === 'onChange' && this.cleanupPeriod && this.cleanupPeriod > 0) {
            expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + this.cleanupPeriod);
        }

        // Temel entry nesnesini oluştur
        const entry: any = {
            trendLogId: new ObjectId(this._id),
            value: value,
            timestamp: now,
            analyzerId: this.analyzerId,
            registerId: this.registerId
        };
        
        // Sadece onChange modunda expiresAt ekle
        if (this.period === 'onChange' && expiresAt) {
            entry.expiresAt = expiresAt;
        }

        // Hangi koleksiyona yazılacağını belirle
        const collectionName = this.period === 'onChange' ?
            'trend_log_entries_onchange' : 'trend_log_entries';

        // MongoDB'ye kaydet
        try {
            const { db } = await connectToDatabase();
            await db.collection(collectionName).insertOne(entry);

            // Değeri başarıyla kaydettikten sonra, merkezi haritayı güncelle.
            if (this.period === 'onChange') {
                const mapKey = `${this.registerId}:${this.analyzerId}`;
                lastStoredValuesPerLogger.set(mapKey, value);
                
                // Son değeri Redis'te sadece referans amaçlı sakla (onChange için)
                if (redisClient.isReady) {
                    try {
                        // Redis'te sadece son değeri sakla, liste değil
                        await redisClient.set(`trendlog:lastvalue:${this.registerId}:${this.analyzerId}`, value.toString());
                    } catch (redisError) {
                        // Redis hatası kritik değil - sessizce devam et
                        backendLogger.debug(`[TREND-LOGGER] Redis error setting last value reference: ${redisError}`,
                            "TrendLogger");
                    }
                }
            }
            
            // onChange modundaysa TTL indeksini kontrol et
            if (this.period === 'onChange' && expiresAt) {
                await this.ensureTTLIndex(db);
            }
        } catch (dbError) {
            backendLogger.error(`[TREND-LOGGER] MongoDB error storing trend log entry: ` +
                (dbError instanceof Error ? dbError.message : String(dbError)),
                "TrendLogger",
                { error: dbError instanceof Error ? dbError.stack : String(dbError) }
            );
            // MongoDB hatası kritik - devam etmeyelim
            return;
        }
    }
    
    // TTL indeksi oluşturmak için yardımcı fonksiyon
    private async ensureTTLIndex(db: any) {
        try {
            const indexes = await db.collection('trend_log_entries_onchange').listIndexes().toArray();
            const ttlIndexExists = indexes.some((idx: any) => idx.name === 'expiresAt_ttl_index');
            
            if (!ttlIndexExists) {
                await db.collection('trend_log_entries_onchange').createIndex(
                    { expiresAt: 1 },
                    {
                        expireAfterSeconds: 0,  // expiresAt alanına göre otomatik sil
                        name: 'expiresAt_ttl_index'
                    }
                );
                backendLogger.info('Created TTL index on trend_log_entries_onchange collection', 'TrendLogger');
            }
        } catch (error) {
            backendLogger.error('Failed to create TTL index', 'TrendLogger', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
