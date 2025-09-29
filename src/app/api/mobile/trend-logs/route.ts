import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için trend logs listesi endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // URL parametrelerini al
    const url = new URL(request.url);
    const analyzerId = url.searchParams.get('analyzerId');
    
    // Trend logs'ları getir
    let trendLogs;
    if (analyzerId) {
      trendLogs = await db.collection('trendLogs').find({ analyzerId: analyzerId }).toArray();
    } else {
      trendLogs = await db.collection('trendLogs').find({}).toArray();
    }
    
    console.log(`Found ${trendLogs.length} trend logs`);
    
    // Analyzer bilgilerini getir
    const analyzers = await db.collection('analyzers').find({}).toArray();
    const analyzerMap = new Map();
    analyzers.forEach(analyzer => {
      analyzerMap.set(analyzer._id.toString(), analyzer);
    });
    
    // Building'lerden register bilgilerini getir
    const buildings = await db.collection('buildings').find({}).toArray();
    const registerMap = new Map();
    
    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes) {
        building.flowData.nodes.forEach((node: any) => {
          if (node.type === 'registerNode' && node.data) {
            registerMap.set(node.id, {
              ...node.data,
              buildingName: building.name,
              buildingId: building._id.toString()
            });
          }
        });
      }
    }
    
    // Trend logs'ları formatla ve ilişkili verileri ekle
    const formattedTrendLogs = trendLogs.map(trendLog => {
      const analyzer = analyzerMap.get(trendLog.analyzerId);
      const register = registerMap.get(trendLog.registerId);
      
      return {
        _id: trendLog._id.toString(),
        analyzerId: trendLog.analyzerId,
        analyzerName: analyzer?.name || `Unknown Analyzer`,
        registerId: trendLog.registerId,
        registerName: register?.label || `Register ${register?.address || 'Unknown'}`,
        registerAddress: register?.address,
        buildingName: register?.buildingName || 'Unknown Building',
        period: trendLog.period,
        interval: trendLog.interval,
        endDate: trendLog.endDate,
        status: trendLog.status || 'unknown',
        isKWHCounter: trendLog.isKWHCounter || false,
        dataType: register?.dataType,
        unit: register?.scaleUnit || '',
        createdAt: trendLog.createdAt ? new Date(trendLog.createdAt).toISOString() : null,
        updatedAt: trendLog.updatedAt ? new Date(trendLog.updatedAt).toISOString() : null
      };
    });
    
    // Analyzer'lara göre grupla
    const groupedByAnalyzer = formattedTrendLogs.reduce((acc: any, trendLog: any) => {
      const analyzerId = trendLog.analyzerId;
      if (!acc[analyzerId]) {
        acc[analyzerId] = [];
      }
      acc[analyzerId].push(trendLog);
      return acc;
    }, {});
    
    console.log(`Trend logs grouped by analyzer:`, Object.keys(groupedByAnalyzer).map(id => `${id}: ${groupedByAnalyzer[id].length} logs`));

    return NextResponse.json({
      success: true,
      total: formattedTrendLogs.length,
      trendLogs: formattedTrendLogs,
      groupedByAnalyzer: groupedByAnalyzer
    });
    
  } catch (error) {
    console.error('Mobile trend logs could not be fetched:', error);
    return NextResponse.json({ 
      error: 'Trend logs could not be fetched',
      success: false,
      trendLogs: [],
      total: 0
    }, { status: 500 });
  }
}