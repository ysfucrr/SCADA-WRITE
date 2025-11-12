import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Tüm consumption widget'lar için comparison verilerini tek seferde döndürür
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trendLogIds } = body; // Array of trend log IDs

    if (!Array.isArray(trendLogIds) || trendLogIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'trendLogIds array is required'
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    // Get all trend logs in one query
    const trendLogs = await db.collection('trendLogs')
      .find({
        _id: { $in: trendLogIds.map((id: string) => new ObjectId(id)) }
      })
      .toArray();

    const trendLogMap = new Map();
    trendLogs.forEach(tl => {
      trendLogMap.set(tl._id.toString(), tl);
    });

    // Process all trend logs in parallel
    const comparisonPromises = trendLogIds.map(async (trendLogId: string) => {
      const trendLog = trendLogMap.get(trendLogId);
      if (!trendLog) {
        return {
          trendLogId,
          success: false,
          error: 'Trend log not found'
        };
      }

      // Koleksiyon seçimi: KWH Counter ise trend_log_entries_kwh, değilse period'a göre
      let collectionName: string;
      if (trendLog.isKWHCounter) {
        collectionName = 'trend_log_entries_kwh';
      } else {
        collectionName = trendLog.period === 'onChange' 
          ? 'trend_log_entries_onchange' 
          : 'trend_log_entries';
      }

      const objectId = new ObjectId(trendLogId);

      // Calculate monthly and yearly comparisons in parallel
      const [monthlyComparison, yearlyComparison] = await Promise.all([
        calculateMonthlyComparison(db, collectionName, objectId, now),
        calculateYearlyComparison(db, collectionName, objectId, now)
      ]);

      const result: any = {
        trendLogId,
        success: true,
        monthly: monthlyComparison,
        yearly: yearlyComparison
      };

      if (trendLog) {
        result.trendLog = {
          _id: trendLog._id,
          registerId: trendLog.registerId,
          analyzerId: trendLog.analyzerId,
          period: trendLog.period,
          interval: trendLog.interval
        };
      }

      return result;
    });

    const results = await Promise.all(comparisonPromises);

    // Compact format
    const compactResults = results.map(result => {
      if (!result.success) {
        return {
          tid: result.trendLogId,
          s: false,
          e: result.error
        };
      }

      const compactMonthly = result.monthly ? {
        pv: result.monthly.previousValue,
        cv: result.monthly.currentValue,
        pt: result.monthly.previousTimestamp instanceof Date ? result.monthly.previousTimestamp.getTime() : result.monthly.previousTimestamp,
        ct: result.monthly.currentTimestamp instanceof Date ? result.monthly.currentTimestamp.getTime() : result.monthly.currentTimestamp,
        pc: result.monthly.percentageChange,
        tf: result.monthly.timeFilter
      } : null;

      const compactYearly = result.yearly ? {
        c: result.yearly.comparison ? {
          pv: result.yearly.comparison.previousValue,
          cv: result.yearly.comparison.currentValue,
          pt: result.yearly.comparison.previousTimestamp instanceof Date ? result.yearly.comparison.previousTimestamp.getTime() : result.yearly.comparison.previousTimestamp,
          ct: result.yearly.comparison.currentTimestamp instanceof Date ? result.yearly.comparison.currentTimestamp.getTime() : result.yearly.comparison.currentTimestamp,
          pc: result.yearly.comparison.percentageChange,
          tf: result.yearly.comparison.timeFilter
        } : null,
        md: result.yearly.monthlyData ? {
          cy: result.yearly.monthlyData.currentYear.map((m: any) => ({
            m: m.month,
            v: m.value,
            t: m.timestamp instanceof Date ? m.timestamp.getTime() : m.timestamp
          })),
          py: result.yearly.monthlyData.previousYear.map((m: any) => ({
            m: m.month,
            v: m.value,
            t: m.timestamp instanceof Date ? m.timestamp.getTime() : m.timestamp
          })),
          cyl: result.yearly.monthlyData.currentYearLabel,
          pyl: result.yearly.monthlyData.previousYearLabel
        } : null
      } : null;

      const compactResult: any = {
        tid: result.trendLogId,
        s: true,
        m: compactMonthly,
        y: compactYearly
      };

      if (result.trendLog) {
        compactResult.tl = {
          _id: result.trendLog._id,
          rid: result.trendLog.registerId,
          aid: result.trendLog.analyzerId,
          p: result.trendLog.period,
          i: result.trendLog.interval
        };
      }

      return compactResult;
    });

    return NextResponse.json({
      success: true,
      data: compactResults,
      dataFormat: "compact"
    });

  } catch (error) {
    console.error('Error fetching consumption widget comparisons:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch consumption widget comparisons'
    }, { status: 500 });
  }
}

async function calculateMonthlyComparison(db: any, collectionName: string, trendLogId: ObjectId, now: Date) {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // Use aggregation pipeline for better performance
  const [currentMonthData, previousMonthData] = await Promise.all([
    db.collection(collectionName).aggregate([
      {
        $match: {
          trendLogId: trendLogId,
          timestamp: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          first: { $min: { value: '$value', timestamp: '$timestamp' } },
          last: { $max: { value: '$value', timestamp: '$timestamp' } }
        }
      }
    ]).toArray(),
    db.collection(collectionName).aggregate([
      {
        $match: {
          trendLogId: trendLogId,
          timestamp: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          first: { $min: { value: '$value', timestamp: '$timestamp' } },
          last: { $max: { value: '$value', timestamp: '$timestamp' } }
        }
      }
    ]).toArray()
  ]);

  let currentConsumption = 0;
  let previousConsumption = 0;

  if (currentMonthData.length > 0 && currentMonthData[0].first && currentMonthData[0].last) {
    currentConsumption = currentMonthData[0].last.value - currentMonthData[0].first.value;
  }

  if (previousMonthData.length > 0 && previousMonthData[0].first && previousMonthData[0].last) {
    previousConsumption = previousMonthData[0].last.value - previousMonthData[0].first.value;
  }

  let percentageChange = 0;
  if (previousConsumption > 0) {
    percentageChange = ((currentConsumption - previousConsumption) / previousConsumption) * 100;
  } else if (previousConsumption === 0 && currentConsumption > 0) {
    percentageChange = 100;
  }

  return {
    previousValue: previousConsumption,
    currentValue: currentConsumption,
    previousTimestamp: previousMonthStart,
    currentTimestamp: currentMonthStart,
    percentageChange,
    timeFilter: 'month'
  };
}

async function calculateYearlyComparison(db: any, collectionName: string, trendLogId: ObjectId, now: Date) {
  const currentYear = now.getFullYear();
  const previousYear = currentYear - 1;

  // Use aggregation pipeline to get all monthly data in one query
  const currentYearStart = new Date(currentYear, 0, 1);
  const currentYearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);
  const previousYearStart = new Date(previousYear, 0, 1);
  const previousYearEnd = new Date(previousYear, 11, 31, 23, 59, 59, 999);

  const [currentYearData, previousYearData] = await Promise.all([
    db.collection(collectionName).aggregate([
      {
        $match: {
          trendLogId: trendLogId,
          timestamp: { $gte: currentYearStart, $lte: currentYearEnd }
        }
      },
      {
        $group: {
          _id: { $month: '$timestamp' },
          first: { $min: { value: '$value', timestamp: '$timestamp' } },
          last: { $max: { value: '$value', timestamp: '$timestamp' } }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray(),
    db.collection(collectionName).aggregate([
      {
        $match: {
          trendLogId: trendLogId,
          timestamp: { $gte: previousYearStart, $lte: previousYearEnd }
        }
      },
      {
        $group: {
          _id: { $month: '$timestamp' },
          first: { $min: { value: '$value', timestamp: '$timestamp' } },
          last: { $max: { value: '$value', timestamp: '$timestamp' } }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray()
  ]);

  const currentYearMonthly = [];
  const previousYearMonthly = [];
  let currentYearTotal = 0;
  let previousYearTotal = 0;

  // Process current year data
  for (let month = 1; month <= 12; month++) {
    const monthData = currentYearData.find((d: any) => d._id === month);
    let consumption = 0;
    if (monthData && monthData.first && monthData.last) {
      consumption = monthData.last.value - monthData.first.value;
    }
    currentYearMonthly.push({
      month,
      value: consumption,
      timestamp: new Date(currentYear, month - 1, 1)
    });
    currentYearTotal += consumption;
  }

  // Process previous year data
  for (let month = 1; month <= 12; month++) {
    const monthData = previousYearData.find((d: any) => d._id === month);
    let consumption = 0;
    if (monthData && monthData.first && monthData.last) {
      consumption = monthData.last.value - monthData.first.value;
    }
    previousYearMonthly.push({
      month,
      value: consumption,
      timestamp: new Date(previousYear, month - 1, 1)
    });
    previousYearTotal += consumption;
  }

  let percentageChange = 0;
  if (previousYearTotal > 0) {
    percentageChange = ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100;
  } else if (previousYearTotal === 0 && currentYearTotal > 0) {
    percentageChange = 100;
  }

  return {
    comparison: {
      previousValue: previousYearTotal,
      currentValue: currentYearTotal,
      previousTimestamp: new Date(previousYear, 0, 1),
      currentTimestamp: new Date(currentYear, 0, 1),
      percentageChange,
      timeFilter: 'year'
    },
    monthlyData: {
      currentYear: currentYearMonthly,
      previousYear: previousYearMonthly,
      currentYearLabel: currentYear,
      previousYearLabel: previousYear
    }
  };
}

