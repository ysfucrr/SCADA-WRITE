import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// Mobile app için billings endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // Billings'leri getir
    const billings = await db.collection('billings').find({}).toArray();
    
    // Analyzer bilgilerini getir
    const analyzers = await db.collection('analyzers').find({}).toArray();
    const analyzerMap = new Map();
    analyzers.forEach(analyzer => {
      analyzerMap.set(analyzer._id.toString(), analyzer);
    });
    
    // Collect all unique trend log IDs from all billings
    const trendLogIds = new Set<string>();
    billings.forEach((billing: any) => {
      if (billing.trendLogs && Array.isArray(billing.trendLogs)) {
        billing.trendLogs.forEach((trendLog: any) => {
          if (trendLog.id) {
            trendLogIds.add(trendLog.id);
          }
        });
      }
    });
    
    // Get first values from KWH collection only for trend logs used in billings
    // This is much faster than fetching all exported: false entries
    // Use aggregation pipeline to get first entry for each trend log in a single query
    const firstValues: any[] = [];
    if (trendLogIds.size > 0) {
      const trendLogObjectIds = Array.from(trendLogIds).map(id => new ObjectId(id));
      
      // Optimized: Use aggregation to get first exported: false entry for each trend log in one query
      const firstValuesPipeline = [
        {
          $match: {
            trendLogId: { $in: trendLogObjectIds },
            $or: [
              { exported: false },
              { exported: { $exists: false } }
            ]
          }
        },
        {
          $sort: { trendLogId: 1, timestamp: 1 }
        },
        {
          $group: {
            _id: '$trendLogId',
            firstValue: { $first: '$value' },
            firstTimestamp: { $first: '$timestamp' },
            entry: { $first: '$$ROOT' }
          }
        }
      ];
      
      const firstValuesResults = await db.collection('trend_log_entries_kwh')
        .aggregate(firstValuesPipeline)
        .toArray();
      
      // Map results to include all entry fields
      firstValuesResults.forEach((result: any) => {
        firstValues.push({
          ...result.entry,
          value: result.firstValue,
          timestamp: result.firstTimestamp
        });
      });
    }
    
    // Billings'leri formatla ve analyzer bilgilerini ekle
    const formattedBillings = billings.map(billing => {
      // Her trend log için analyzer adını ekle
      const formattedTrendLogs = billing.trendLogs.map((trendLog: any) => {
        const analyzer = analyzerMap.get(trendLog.analyzerId?.toString());
        const matchingEntry = firstValues.find(firstValue => firstValue.trendLogId.toString() === trendLog.id);
        
        return {
          ...trendLog,
          analyzerName: analyzer?.name || 'Unknown',
          firstValue: matchingEntry ? matchingEntry.value : trendLog.firstValue || 0,
        };
      });
      
      return {
        _id: billing._id.toString(),
        name: billing.name,
        price: billing.price,
        currency: billing.currency,
        trendLogs: formattedTrendLogs,
        startTime: billing.startTime ? new Date(billing.startTime).toISOString() : null,
        createdAt: billing.createdAt ? new Date(billing.createdAt).toISOString() : null,
        updatedAt: billing.updatedAt ? new Date(billing.updatedAt).toISOString() : null,
      };
    });
    
    // Trend log entries gibi compression bilgisi ekle
    // Orijinal format boyutu (tahmini - tüm alanlar ile)
    const originalFormatSize = JSON.stringify(formattedBillings).length;
    
    // Compact format - gereksiz alanları kaldır veya optimize et
    const compactBillings = formattedBillings.map(billing => ({
      _id: billing._id,
      n: billing.name, // name -> n
      p: billing.price, // price -> p
      c: billing.currency, // currency -> c
      tl: billing.trendLogs.map((tl: any) => ({
        id: tl.id,
        aid: tl.analyzerId, // analyzerId -> aid
        an: tl.analyzerName, // analyzerName -> an
        rid: tl.registerId, // registerId -> rid
        fv: tl.firstValue, // firstValue -> fv
        cv: tl.currentValue // currentValue -> cv
      })),
      st: billing.startTime ? new Date(billing.startTime).getTime() : null, // startTime -> st (timestamp)
      ct: billing.createdAt ? new Date(billing.createdAt).getTime() : null, // createdAt -> ct (timestamp)
      ut: billing.updatedAt ? new Date(billing.updatedAt).getTime() : null // updatedAt -> ut (timestamp)
    }));
    
    const compactFormatSize = JSON.stringify(compactBillings).length;
    const compressionRatio = ((1 - compactFormatSize / originalFormatSize) * 100).toFixed(2);
    
    console.log(`[BILLING] Found ${formattedBillings.length} billings`);
    console.log(`[BILLING] Original format size: ${(originalFormatSize / 1024).toFixed(2)} KB`);
    console.log(`[BILLING] Compact format size: ${(compactFormatSize / 1024).toFixed(2)} KB`);
    console.log(`[BILLING] Data format compression: ${compressionRatio}%`);
    
    // Compact format kullan (trend log entries gibi)
    return NextResponse.json({
      success: true,
      total: compactBillings.length,
      billings: compactBillings,
      dataFormat: "compact" // Mobil uygulamanın bu formatı tanıması için
    });
    
  } catch (error) {
    console.error('Mobile billings could not be fetched:', error);
    return NextResponse.json({ 
      error: 'Billings could not be fetched',
      success: false,
      billings: [],
      total: 0
    }, { status: 500 });
  }
}
