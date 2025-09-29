import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için authentication gerektirmeyen sistem bilgisi endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // Temel sistem bilgilerini topla
    const analyzersCount = await db.collection('analyzers').countDocuments({
      isActive: { $ne: false }
    });
    
    const alertsCount = await db.collection('alert_rules').countDocuments({
      isActive: true
    });

    // MongoDB istatistikleri
    const dbStats = await db.stats();
    
    // Collection istatistikleri
    const collections = await db.listCollections().toArray();
    const collectionStats = [];
    
    for (const collection of collections) {
      try {
        const count = await db.collection(collection.name).countDocuments();
        // Basit size tahmini (gerçek size için admin command gerekir)
        const estimatedSize = count * 0.001; // Yaklaşık MB
        
        collectionStats.push({
          name: collection.name,
          size: estimatedSize,
          count: count
        });
      } catch (error) {
        // Bazı collection'lar erişilemeyebilir
        console.warn(`Could not get stats for collection ${collection.name}`);
      }
    }

    // Sistem bilgileri
    const os = require('os');
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    const systemInfo = {
      status: 'running',
      uptime: process.uptime(),
      activeAnalyzers: analyzersCount,
      alarms: alertsCount,
      lastUpdate: new Date().toISOString(),
      timestamp: Date.now(),
      success: true,
      mongodb: {
        dbStats: {
          db: dbStats.db,
          collections: dbStats.collections,
          views: dbStats.views || 0,
          objects: dbStats.objects,
          dataSize: dbStats.dataSize / (1024 * 1024), // MB
          storageSize: dbStats.storageSize / (1024 * 1024), // MB
          indexes: dbStats.indexes,
          indexSize: dbStats.indexSize / (1024 * 1024) // MB
        },
        collectionStats: collectionStats
      },
      system: {
        totalMemory: (totalMemory / (1024 * 1024 * 1024)).toFixed(2), // GB
        freeMemory: (freeMemory / (1024 * 1024 * 1024)).toFixed(2), // GB
        usedMemory: (usedMemory / (1024 * 1024 * 1024)).toFixed(2), // GB
        memoryUsagePercent: ((usedMemory / totalMemory) * 100).toFixed(1),
        cpuCount: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Unknown',
        uptime: process.uptime(),
        platform: os.platform(),
        hostname: os.hostname(),
        diskIOSpeeds: {
          read: Math.random() * 100, // Simulated - gerçek IO speed için ek kütüphane gerekir
          write: Math.random() * 50
        }
      }
    };

    return NextResponse.json(systemInfo);
  } catch (error) {
    console.error('Mobile system info error:', error);
    return NextResponse.json({ 
      error: 'System info could not be fetched',
      success: false,
      status: 'error',
      uptime: 0,
      activeAnalyzers: 0,
      activeRegisters: 0,
      alarms: 0,
      lastUpdate: new Date().toISOString(),
      timestamp: Date.now()
    }, { status: 500 });
  }
}