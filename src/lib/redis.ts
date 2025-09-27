import { createClient, RedisClientType } from 'redis';
import { backendLogger } from './logger/BackendLogger';
import { fileLogger } from './logger/FileLogger';

// Create Redis client
export const redisClient: RedisClientType = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 50, 1000);
            fileLogger.info(`Redis reconnect attempt ${retries} with delay ${delay}ms`);
            return delay;
        }
    }
});

// Set up event listeners
redisClient.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
        // Bağlantı reddedildi hatalarını daha düşük seviyede logla
        fileLogger.info('[REDIS] Connection temporarily unavailable - will auto-reconnect', { error: err.message });
    } else {
        fileLogger.error('[REDIS] Client error', { error: err.message, stack: err.stack });
        backendLogger.error('Redis Client Error', 'Redis', err);
    }
});

redisClient.on('connect', () => {
    fileLogger.info('[REDIS] Client connected');
    backendLogger.info('Redis client connected', 'Redis');
});

redisClient.on('ready', () => {
    fileLogger.info('[REDIS] Client ready');
    backendLogger.info('Redis client ready, caching enabled', 'Redis');
});

redisClient.on('reconnecting', () => {
    fileLogger.info('[REDIS] Client reconnecting');
});

// Connect method that can be called to initialize the connection
export const connectRedis = async (): Promise<boolean> => {
    try {
        if (!redisClient.isOpen) {
            fileLogger.info('[REDIS] Connecting to Redis server...');
            await redisClient.connect();
            fileLogger.info('[REDIS] Connection established successfully');
            return true;
        } else {
            fileLogger.info('[REDIS] Redis client already connected');
            return true;
        }
    } catch (error) {
        fileLogger.error('[REDIS] Connection failed', { error: (error as Error).message });
        // Don't throw - let the application continue without Redis
        return false;
    }
};

// Disconnect method for clean shutdown
export const disconnectRedis = async (): Promise<void> => {
    try {
        if (redisClient.isOpen) {
            fileLogger.info('[REDIS] Disconnecting Redis client...');
            await redisClient.disconnect();
            fileLogger.info('[REDIS] Redis client disconnected successfully');
        }
    } catch (error) {
        fileLogger.error('[REDIS] Disconnect error', { error: (error as Error).message });
    }
};