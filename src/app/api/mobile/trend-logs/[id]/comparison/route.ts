import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// Mobile app için trend log karşılaştırma endpoint'i
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trendLogId } = await params;
    const timeFilter = request.nextUrl.searchParams.get('timeFilter') || 'month';

    const { db } = await connectToDatabase();

    // Trend log'u kontrol et
    const trendLog = await db.collection('trendLogs').findOne({ 
      _id: new ObjectId(trendLogId) 
    });

    if (!trendLog) {
      return NextResponse.json({ 
        error: 'Trend log not found',
        success: false 
      }, { status: 404 });
    }

    // Tarih aralıklarını hesapla
    const now = new Date();
    let startDate = new Date();
    let previousPeriodStart = new Date();
    let previousPeriodEnd = new Date();

    switch (timeFilter) {
      case 'month':
        // Bu ay - en son runtime değeri için
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        
        // Önceki ay - maksimum değer için
        previousPeriodStart.setMonth(now.getMonth() - 1);
        previousPeriodStart.setDate(1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        
        previousPeriodEnd.setMonth(now.getMonth());
        previousPeriodEnd.setDate(0); // Önceki ayın son günü
        previousPeriodEnd.setHours(23, 59, 59, 999);
        break;
        
      case 'year':
        // Bu yıl
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        
        // Önceki yıl
        previousPeriodStart.setFullYear(now.getFullYear() - 1);
        previousPeriodStart.setMonth(0, 1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        
        previousPeriodEnd.setFullYear(now.getFullYear() - 1);
        previousPeriodEnd.setMonth(11, 31);
        previousPeriodEnd.setHours(23, 59, 59, 999);
        break;
    }

    // Koleksiyon adını belirle
    const collectionName = trendLog.period === 'onChange' ? 
      'trend_log_entries_onchange' : 'trend_log_entries';

    // Güncel dönem verilerini al
    const currentEntries = await db.collection(collectionName)
      .find({
        trendLogId: new ObjectId(trendLogId),
        timestamp: { $gte: startDate, $lte: now }
      })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    // Önceki dönem verilerini al
    let previousEntries = [];
    if (timeFilter === 'month') {
      // Aylık için maksimum değeri al
      previousEntries = await db.collection(collectionName)
        .find({
          trendLogId: new ObjectId(trendLogId),
          timestamp: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
        })
        .sort({ value: -1 }) // Değere göre sıralayarak maksimumu al
        .limit(1)
        .toArray();
    } else {
      // Yıllık için son değeri al
      previousEntries = await db.collection(collectionName)
        .find({
          trendLogId: new ObjectId(trendLogId),
          timestamp: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
        })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();
    }

    // Karşılaştırma değerlerini hazırla
    let currentValue = null;
    let previousValue = null;
    let currentTimestamp = null;
    let previousTimestamp = null;
    
    if (currentEntries.length > 0) {
      currentValue = currentEntries[0].value;
      currentTimestamp = currentEntries[0].timestamp;
    } else {
      currentTimestamp = now;
    }
    
    if (previousEntries.length > 0) {
      previousValue = previousEntries[0].value;
      previousTimestamp = previousEntries[0].timestamp;
    } else {
      previousTimestamp = previousPeriodStart;
    }

    // Yüzde değişimi hesapla
    let percentageChange = null;
    if (previousValue !== null && currentValue !== null && previousValue !== 0) {
      percentageChange = ((currentValue - previousValue) / previousValue) * 100;
    } else if (previousValue === null && currentValue !== null) {
      percentageChange = 100;
    } else if (previousValue !== null && currentValue === null) {
      percentageChange = -100;
    }

    // Aylık görünüm için runtime değeri al
    if (timeFilter === 'month' && currentValue === null) {
      try {
        const { redisClient } = require('@/lib/redis');
        if (redisClient && redisClient.isReady) {
          const registerId = trendLog.registerId;
          const analyzerId = trendLog.analyzerId || 'default';
          const cachedValue = await redisClient.get(`trendlog:lastvalue:${registerId}:${analyzerId}`);
          
          if (cachedValue) {
            currentValue = parseFloat(cachedValue);
            currentTimestamp = now;
            
            // Yüzde değişimi yeniden hesapla
            if (previousValue !== null && previousValue !== 0) {
              percentageChange = ((currentValue - previousValue) / previousValue) * 100;
            } else if (previousValue === null) {
              percentageChange = 100;
            }
          }
        }
      } catch (error) {
        console.error('Runtime değeri alınamadı:', error);
      }
    }

    // Yıllık görünüm için aylık verileri hazırla
    if (timeFilter === 'year') {
      const currentYear = now.getFullYear();
      const previousYear = currentYear - 1;
      
      // Bu yılın aylık verileri
      const currentYearMonthly = [];
      let currentYearTotal = 0;
      
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(currentYear, month, 1);
        const monthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59, 999);
        
        const monthEntries = await db.collection(collectionName)
          .find({
            trendLogId: new ObjectId(trendLogId),
            timestamp: { $gte: monthStart, $lte: monthEnd }
          })
          .sort({ value: -1 }) // En yüksek değeri al
          .limit(1)
          .toArray();
          
        const monthValue = monthEntries.length > 0 ? monthEntries[0].value : 0;
        currentYearTotal += monthValue;
        
        currentYearMonthly.push({
          month,
          value: monthValue,
          timestamp: monthStart
        });
      }
      
      // Önceki yılın aylık verileri
      const previousYearMonthly = [];
      let previousYearTotal = 0;
      
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(previousYear, month, 1);
        const monthEnd = new Date(previousYear, month + 1, 0, 23, 59, 59, 999);
        
        const monthEntries = await db.collection(collectionName)
          .find({
            trendLogId: new ObjectId(trendLogId),
            timestamp: { $gte: monthStart, $lte: monthEnd }
          })
          .sort({ value: -1 }) // En yüksek değeri al
          .limit(1)
          .toArray();
          
        const monthValue = monthEntries.length > 0 ? monthEntries[0].value : 0;
        previousYearTotal += monthValue;
        
        previousYearMonthly.push({
          month,
          value: monthValue,
          timestamp: monthStart
        });
      }
      
      // Yıllık yüzde değişimi hesapla
      let yearlyPercentageChange = null;
      if (previousYearTotal !== 0) {
        yearlyPercentageChange = ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100;
      }
      
      return NextResponse.json({
        success: true,
        comparison: {
          previousValue: previousYearTotal,
          currentValue: currentYearTotal,
          previousTimestamp,
          currentTimestamp,
          percentageChange: yearlyPercentageChange,
          timeFilter
        },
        monthlyData: {
          currentYear: currentYearMonthly,
          previousYear: previousYearMonthly,
          currentYearLabel: currentYear,
          previousYearLabel: previousYear
        },
        trendLog: {
          id: trendLog._id.toString(),
          registerId: trendLog.registerId,
          analyzerId: trendLog.analyzerId,
          isKWHCounter: trendLog.isKWHCounter
        }
      });
    }

    // Aylık görünüm için yanıt
    return NextResponse.json({
      success: true,
      comparison: {
        previousValue,
        currentValue,
        previousTimestamp,
        currentTimestamp,
        percentageChange,
        timeFilter
      },
      trendLog: {
        id: trendLog._id.toString(),
        registerId: trendLog.registerId,
        analyzerId: trendLog.analyzerId,
        isKWHCounter: trendLog.isKWHCounter
      }
    });

  } catch (error) {
    console.error('Mobile trend log comparison hatası:', error);
    return NextResponse.json({ 
      error: 'Trend log karşılaştırması alınamadı',
      success: false 
    }, { status: 500 });
  }
}