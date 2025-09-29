import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// Mobile app için trend log detayları ve entries endpoint'i
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    const { db } = await connectToDatabase();
    
    // Trend log bilgisini getir
    const trendLog = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    if (!trendLog) {
      return NextResponse.json({ 
        error: 'Trend log not found',
        success: false 
      }, { status: 404 });
    }
    
    // Analyzer ve register bilgilerini getir
    const analyzer = await db.collection('analyzers').findOne({ _id: new ObjectId(trendLog.analyzerId) });
    
    // Register bilgisini building'lerden bul
    const buildings = await db.collection('buildings').find({}).toArray();
    let registerInfo = null;
    
    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes) {
        const foundNode = building.flowData.nodes.find((node: any) => 
          node.type === 'registerNode' && node.id === trendLog.registerId
        );
        if (foundNode) {
          registerInfo = {
            ...foundNode.data,
            buildingName: building.name,
            buildingId: building._id.toString()
          };
          break;
        }
      }
    }
    
    // onChange için farklı koleksiyon kullan
    const collectionName = trendLog.period === 'onChange' ?
      'trend_log_entries_onchange' : 'trend_log_entries';
    
    // Query builder oluştur
    let query: any = { trendLogId: new ObjectId(id) };
    
    // Tarih filtreleri ekle
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    // Verileri getir
    let trendLogEntries = db.collection(collectionName)
      .find(query)
      .sort({ timestamp: -1 }); // En yeni önce
    
    // Limit uygula
    if (limit) {
      trendLogEntries = trendLogEntries.limit(parseInt(limit));
    }
    
    const entries = await trendLogEntries.toArray();
    
    // Kronolojik sıra için ters çevir
    if (limit) {
      entries.reverse();
    }
    
    // Response formatla
    const formattedTrendLog = {
      _id: trendLog._id.toString(),
      analyzerId: trendLog.analyzerId,
      analyzerName: analyzer?.name || 'Unknown Analyzer',
      registerId: trendLog.registerId,
      registerName: registerInfo?.label || `Register ${registerInfo?.address || 'Unknown'}`,
      registerAddress: registerInfo?.address,
      buildingName: registerInfo?.buildingName || 'Unknown Building',
      period: trendLog.period,
      interval: trendLog.interval,
      endDate: trendLog.endDate,
      status: trendLog.status || 'unknown',
      isKWHCounter: trendLog.isKWHCounter || false,
      dataType: registerInfo?.dataType,
      unit: registerInfo?.scaleUnit || '',
      createdAt: trendLog.createdAt ? new Date(trendLog.createdAt).toISOString() : null,
      updatedAt: trendLog.updatedAt ? new Date(trendLog.updatedAt).toISOString() : null
    };
    
    const formattedEntries = entries.map(entry => ({
      _id: entry._id.toString(),
      value: entry.value,
      timestamp: new Date(entry.timestamp).toISOString(),
      timestampMs: new Date(entry.timestamp).getTime()
    }));
    
    return NextResponse.json({
      success: true,
      trendLog: formattedTrendLog,
      entries: formattedEntries,
      totalEntries: formattedEntries.length,
      collectionUsed: collectionName
    });
    
  } catch (error) {
    console.error('Mobile trend log detail fetch failed:', error);
    return NextResponse.json({ 
      error: 'Trend log detail could not be fetched',
      success: false 
    }, { status: 500 });
  }
}