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
    
    const registersCount = await db.collection('analyzers').aggregate([
      { $match: { isActive: { $ne: false } } },
      { $project: { registerCount: { $size: { $ifNull: ["$registers", []] } } } },
      { $group: { _id: null, total: { $sum: "$registerCount" } } }
    ]).toArray();
    
    const alertsCount = await db.collection('alert_rules').countDocuments({ 
      isActive: true 
    });
    
    const systemInfo = {
      status: 'running',
      uptime: process.uptime(),
      activeAnalyzers: analyzersCount,
      activeRegisters: registersCount.length > 0 ? registersCount[0].total : 0,
      alarms: alertsCount,
      lastUpdate: new Date().toISOString(),
      timestamp: Date.now(),
      success: true
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