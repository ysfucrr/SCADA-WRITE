import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için authentication gerektirmeyen analyzer endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // Sadece aktif analizörleri getir
    const analyzers = await db.collection('analyzers').find({ 
      isActive: { $ne: false } // isActive false olmayan tüm analizörler
    }).toArray();

    // Convert ObjectId to string ve sadece gerekli alanları döndür
    const formattedAnalyzers = analyzers.map(analyzer => ({
      _id: analyzer._id.toString(),
      name: analyzer.name,
      slaveId: analyzer.slaveId,
      model: analyzer.model,
      connection: analyzer.connection,
      gateway: analyzer.gateway,
      isActive: analyzer.isActive !== false,
      registers: analyzer.registers || [],
      createdAt: analyzer.createdAt ? new Date(analyzer.createdAt).toISOString() : null
    }));

    return NextResponse.json(formattedAnalyzers);
  } catch (error) {
    console.error('Mobile analyzers could not be fetched:', error);
    return NextResponse.json({ 
      error: 'Analyzers could not be fetched',
      success: false 
    }, { status: 500 });
  }
}

// Mobile app için basit sistem bilgisi endpoint'i
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action === 'system-info') {
      const { db } = await connectToDatabase();
      
      // Temel sistem bilgilerini topla
      const analyzersCount = await db.collection('analyzers').countDocuments({ isActive: { $ne: false } });
      const registersCount = await db.collection('analyzers').aggregate([
        { $match: { isActive: { $ne: false } } },
        { $project: { registerCount: { $size: { $ifNull: ["$registers", []] } } } },
        { $group: { _id: null, total: { $sum: "$registerCount" } } }
      ]).toArray();
      
      const alertsCount = await db.collection('alert_rules').countDocuments({ isActive: true });
      
      const systemInfo = {
        status: 'running',
        uptime: process.uptime(),
        activeAnalyzers: analyzersCount,
        activeRegisters: registersCount.length > 0 ? registersCount[0].total : 0,
        alarms: alertsCount,
        lastUpdate: new Date().toISOString(),
        timestamp: Date.now()
      };

      return NextResponse.json(systemInfo);
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Mobile system info error:', error);
    return NextResponse.json({ 
      error: 'System info could not be fetched',
      success: false 
    }, { status: 500 });
  }
}