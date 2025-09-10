import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function GET() {
  try {
    const { db, client } = await connectToDatabase();
    
    // Get MongoDB stats
    const dbStats = await db.command({ dbStats: 1, scale: 1024 * 1024 }); // Scale to MB
    
    // Get collections stats
    const collections = await db.listCollections().toArray();
    const collectionStats = await Promise.all(
      collections.map(async (collection) => {
        const stats = await db.command({ collStats: collection.name, scale: 1024 * 1024 });
        return {
          name: collection.name,
          size: stats.size,
          count: stats.count
        };
      })
    );

    // Get system info
    const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
    const freeMemory = os.freemem() / (1024 * 1024 * 1024); // GB
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    const cpuInfo = os.cpus();
    const cpuCount = cpuInfo.length;
    const cpuModel = cpuInfo[0].model;
    
    const uptime = os.uptime(); // in seconds
    
    // Dummy I/O speeds (simulated)
    // In a real implementation, you would need to measure actual disk read/write speeds
    const diskIOSpeeds = {
      read: Math.floor(Math.random() * 500) + 100, // Random value between 100-600 MB/s
      write: Math.floor(Math.random() * 400) + 50, // Random value between 50-450 MB/s
    };

    return NextResponse.json({
      mongodb: {
        dbStats,
        collectionStats,
      },
      system: {
        totalMemory: totalMemory.toFixed(2),
        freeMemory: freeMemory.toFixed(2),
        usedMemory: usedMemory.toFixed(2),
        memoryUsagePercent: memoryUsagePercent.toFixed(2),
        cpuCount,
        cpuModel,
        uptime,
        platform: os.platform(),
        hostname: os.hostname(),
        diskIOSpeeds,
      }
    });
  } catch (error) {
    console.error('Error fetching system information:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system information' },
      { status: 500 }
    );
  }
}