import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const timeFilter = searchParams.get('timeFilter') || 'month';

    const { db } = await connectToDatabase();

    // Get trend log details
    const trendLog = await db.collection('trendLogs').findOne({
      _id: new ObjectId(id)
    });

    if (!trendLog) {
      return NextResponse.json({
        success: false,
        error: 'Trend log not found'
      }, { status: 404 });
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

    const now = new Date();
    let comparison = null;
    let monthlyData = null;

    if (timeFilter === 'month') {
      // Monthly comparison - calculate actual consumption
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      // Get first and last values for current month
      const currentMonthFirst = await db.collection(collectionName)
        .findOne(
          {
            trendLogId: new ObjectId(id),
            timestamp: { $gte: currentMonthStart, $lte: currentMonthEnd }
          },
          { sort: { timestamp: 1 } }
        );

      const currentMonthLast = await db.collection(collectionName)
        .findOne(
          {
            trendLogId: new ObjectId(id),
            timestamp: { $gte: currentMonthStart, $lte: currentMonthEnd }
          },
          { sort: { timestamp: -1 } }
        );

      // Get first and last values for previous month
      const previousMonthFirst = await db.collection(collectionName)
        .findOne(
          {
            trendLogId: new ObjectId(id),
            timestamp: { $gte: previousMonthStart, $lte: previousMonthEnd }
          },
          { sort: { timestamp: 1 } }
        );

      const previousMonthLast = await db.collection(collectionName)
        .findOne(
          {
            trendLogId: new ObjectId(id),
            timestamp: { $gte: previousMonthStart, $lte: previousMonthEnd }
          },
          { sort: { timestamp: -1 } }
        );

      // Calculate consumptions
      let currentConsumption = 0;
      let previousConsumption = 0;

      if (currentMonthFirst && currentMonthLast) {
        currentConsumption = currentMonthLast.value - currentMonthFirst.value;
      }

      if (previousMonthFirst && previousMonthLast) {
        previousConsumption = previousMonthLast.value - previousMonthFirst.value;
      }

      // Calculate percentage change
      let percentageChange = 0;
      if (previousConsumption > 0) {
        percentageChange = ((currentConsumption - previousConsumption) / previousConsumption) * 100;
      } else if (previousConsumption === 0 && currentConsumption > 0) {
        percentageChange = 100;
      }

      comparison = {
        previousValue: previousConsumption,
        currentValue: currentConsumption,
        previousTimestamp: previousMonthStart,
        currentTimestamp: currentMonthStart,
        percentageChange,
        timeFilter
      };

    } else if (timeFilter === 'year') {
      // Yearly comparison - sum of monthly consumptions
      const currentYear = now.getFullYear();
      const previousYear = currentYear - 1;

      const currentYearData = [];
      const previousYearData = [];
      let currentYearTotal = 0;
      let previousYearTotal = 0;

      // Calculate monthly consumptions for both years
      for (let month = 0; month < 12; month++) {
        // Current year month
        const currentMonthStart = new Date(currentYear, month, 1);
        const currentMonthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59, 999);

        const currentFirst = await db.collection(collectionName)
          .findOne(
            {
              trendLogId: new ObjectId(id),
              timestamp: { $gte: currentMonthStart, $lte: currentMonthEnd }
            },
            { sort: { timestamp: 1 } }
          );

        const currentLast = await db.collection(collectionName)
          .findOne(
            {
              trendLogId: new ObjectId(id),
              timestamp: { $gte: currentMonthStart, $lte: currentMonthEnd }
            },
            { sort: { timestamp: -1 } }
          );

        let currentMonthConsumption = 0;
        if (currentFirst && currentLast) {
          currentMonthConsumption = currentLast.value - currentFirst.value;
        }

        currentYearData.push({
          month: month + 1,
          value: currentMonthConsumption,
          timestamp: currentMonthStart
        });
        currentYearTotal += currentMonthConsumption;

        // Previous year month
        const previousMonthStart = new Date(previousYear, month, 1);
        const previousMonthEnd = new Date(previousYear, month + 1, 0, 23, 59, 59, 999);

        const previousFirst = await db.collection(collectionName)
          .findOne(
            {
              trendLogId: new ObjectId(id),
              timestamp: { $gte: previousMonthStart, $lte: previousMonthEnd }
            },
            { sort: { timestamp: 1 } }
          );

        const previousLast = await db.collection(collectionName)
          .findOne(
            {
              trendLogId: new ObjectId(id),
              timestamp: { $gte: previousMonthStart, $lte: previousMonthEnd }
            },
            { sort: { timestamp: -1 } }
          );

        let previousMonthConsumption = 0;
        if (previousFirst && previousLast) {
          previousMonthConsumption = previousLast.value - previousFirst.value;
        }

        previousYearData.push({
          month: month + 1,
          value: previousMonthConsumption,
          timestamp: previousMonthStart
        });
        previousYearTotal += previousMonthConsumption;
      }

      // Calculate percentage change
      let percentageChange = 0;
      if (previousYearTotal > 0) {
        percentageChange = ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100;
      } else if (previousYearTotal === 0 && currentYearTotal > 0) {
        percentageChange = 100;
      }

      comparison = {
        previousValue: previousYearTotal,
        currentValue: currentYearTotal,
        previousTimestamp: new Date(previousYear, 0, 1),
        currentTimestamp: new Date(currentYear, 0, 1),
        percentageChange,
        timeFilter
      };

      monthlyData = {
        currentYear: currentYearData,
        previousYear: previousYearData,
        currentYearLabel: currentYear,
        previousYearLabel: previousYear
      };
    }

    return NextResponse.json({
      success: true,
      comparison,
      monthlyData,
      trendLog: {
        _id: trendLog._id,
        registerId: trendLog.registerId,
        analyzerId: trendLog.analyzerId,
        period: trendLog.period,
        interval: trendLog.interval
      }
    });

  } catch (error) {
    console.error('Error fetching trend log comparison:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch trend log comparison'
    }, { status: 500 });
  }
}