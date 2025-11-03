import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

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
    
    // Get first values from both periodic and onChange collections
    const periodicFirstValues = await db.collection('trend_log_entries').find({
      $or: [
        { exported: false },
        { exported: { $exists: false } }
      ]
    }).toArray();
    
    const onChangeFirstValues = await db.collection('trend_log_entries_onchange').find({
      $or: [
        { exported: false },
        { exported: { $exists: false } }
      ]
    }).toArray();
    
    // Combine both arrays
    const firstValues = [...periodicFirstValues, ...onChangeFirstValues];
    
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
    
    console.log(`Found ${formattedBillings.length} billings`);
    
    return NextResponse.json({
      success: true,
      total: formattedBillings.length,
      billings: formattedBillings
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
