import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id: trendLogId } = await params;
    const timeFilter = request.nextUrl.searchParams.get('timeFilter') || 'day';

    const { db } = await connectToDatabase();

    // First, get the trend log to check if it exists and get its configuration
    const trendLog = await db.collection('trendLogs').findOne({ 
      _id: new ObjectId(trendLogId) 
    });

    if (!trendLog) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }

    // Calculate the date range based on the time filter
    const now = new Date();
    let startDate = new Date();
    let previousPeriodStart = new Date();
    let previousPeriodEnd = new Date();

    switch (timeFilter) {
      case 'hour':
        // Current hour - get the latest value from current hour
        startDate = new Date(now);
        startDate.setMinutes(0, 0, 0);
        
        // Previous hour - get the latest value from previous hour
        previousPeriodStart = new Date(now);
        previousPeriodStart.setHours(now.getHours() - 1);
        previousPeriodStart.setMinutes(0, 0, 0);
        
        previousPeriodEnd = new Date(now);
        previousPeriodEnd.setHours(now.getHours() - 1);
        previousPeriodEnd.setMinutes(59, 59, 999);
        break;
      case 'day':
        // Today - get the latest value from today
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        
        // Yesterday - get the latest value from yesterday
        previousPeriodStart = new Date(now);
        previousPeriodStart.setDate(now.getDate() - 1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        
        previousPeriodEnd = new Date(now);
        previousPeriodEnd.setDate(now.getDate() - 1);
        previousPeriodEnd.setHours(23, 59, 59, 999);
        break;
      case 'month':
        // This month - to fetch latest runtime value
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        // Previous month - full month range
        previousPeriodStart.setMonth(now.getMonth() - 1);
        previousPeriodStart.setDate(1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        previousPeriodEnd.setMonth(now.getMonth());
        previousPeriodEnd.setDate(0); // Last day of previous month
        previousPeriodEnd.setHours(23, 59, 59, 999);
        break;
      case 'year':
        // This year
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        // Previous year
        previousPeriodStart.setFullYear(now.getFullYear() - 1);
        previousPeriodStart.setMonth(0, 1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        previousPeriodEnd.setFullYear(now.getFullYear() - 1);
        previousPeriodEnd.setMonth(11, 31);
        previousPeriodEnd.setHours(23, 59, 59, 999);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
        previousPeriodStart.setDate(now.getDate() - 1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        previousPeriodEnd.setDate(now.getDate() - 1);
        previousPeriodEnd.setHours(23, 59, 59, 999);
    }

    // Determine which collection to query based on the trend log period
    const collectionName = trendLog.period === 'onChange' ? 
      'trend_log_entries_onchange' : 'trend_log_entries';

    // Fetch current period entries
    const currentEntries = await db.collection(collectionName)
      .find({
        trendLogId: new ObjectId(trendLogId),
        timestamp: { $gte: startDate, $lte: now }
      })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    // For month filter, calculate actual consumption (last value - first value)
    let previousEntries: any[] = [];
    let previousMonthConsumption = null;
    
    if (timeFilter === 'month') {
      // Get first value of previous month
      const firstValuePreviousMonth = await db.collection(collectionName)
        .find({
          trendLogId: new ObjectId(trendLogId),
          timestamp: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
        })
        .sort({ timestamp: 1 }) // Sort ascending to get first value
        .limit(1)
        .toArray();
      
      // Get last value of previous month
      const lastValuePreviousMonth = await db.collection(collectionName)
        .find({
          trendLogId: new ObjectId(trendLogId),
          timestamp: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
        })
        .sort({ timestamp: -1 }) // Sort descending to get last value
        .limit(1)
        .toArray();
      
      // Calculate consumption for previous month
      if (firstValuePreviousMonth.length > 0 && lastValuePreviousMonth.length > 0) {
        const firstValue = firstValuePreviousMonth[0].value;
        const lastValue = lastValuePreviousMonth[0].value;
        previousMonthConsumption = lastValue - firstValue;
        
        // For display purposes, we'll use the consumption value
        previousEntries = [{
          value: previousMonthConsumption,
          timestamp: previousPeriodEnd,
          isConsumption: true
        }];
      }
    } else {
      // For other filters, use the original logic
      previousEntries = await db.collection(collectionName)
        .find({
          trendLogId: new ObjectId(trendLogId),
          timestamp: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
        })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();
    }

    // Get values for comparison
    let currentValue = null;
    let previousValue = null;
    let currentTimestamp = null;
    let previousTimestamp = null;
    let currentMonthConsumption = null;
    
    // For month filter, calculate current month consumption too
    if (timeFilter === 'month') {
      // Get first value of current month
      const firstValueCurrentMonth = await db.collection(collectionName)
        .find({
          trendLogId: new ObjectId(trendLogId),
          timestamp: { $gte: startDate, $lte: now }
        })
        .sort({ timestamp: 1 })
        .limit(1)
        .toArray();
      
      if (currentEntries.length > 0 && firstValueCurrentMonth.length > 0) {
        const firstValue = firstValueCurrentMonth[0].value;
        const lastValue = currentEntries[0].value;
        currentMonthConsumption = lastValue - firstValue;
        currentValue = currentMonthConsumption;
        currentTimestamp = currentEntries[0].timestamp;
      } else {
        currentTimestamp = now;
      }
      
      // Previous value is already set as consumption
      if (previousEntries.length > 0) {
        previousValue = previousEntries[0].value;
        previousTimestamp = previousEntries[0].timestamp;
      } else {
        previousTimestamp = previousPeriodEnd;
      }
    } else {
      // For other time filters, use original logic
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
        if (timeFilter === 'hour') {
          previousTimestamp = new Date(now);
          previousTimestamp.setHours(now.getHours() - 1);
        } else if (timeFilter === 'day') {
          previousTimestamp = new Date(now);
          previousTimestamp.setDate(now.getDate() - 1);
        } else {
          previousTimestamp = previousPeriodStart;
        }
      }
    }

    // Calculate percentage change
    let percentageChange = null;
    if (previousValue !== null && currentValue !== null && previousValue !== 0) {
      percentageChange = ((currentValue - previousValue) / previousValue) * 100;
    } else if (previousValue === null && currentValue !== null) {
      // If no previous value but current value exists, show 100% increase
      percentageChange = 100;
    } else if (previousValue !== null && currentValue === null) {
      // If previous value exists but no current value, show -100%
      percentageChange = -100;
    }

    // For month filter, try to fetch the current runtime value if needed
    if (timeFilter === 'month' && currentValue === null) {
      try {
        // Get the trend log's register ID and analyzer ID
        const registerId = trendLog.registerId;
        const analyzerId = trendLog.analyzerId || 'default';
        
        // Try to get the latest value from Redis (assuming it's used for caching)
        const { redisClient } = require('@/lib/redis');
        if (redisClient.isReady) {
          const cachedValue = await redisClient.get(`trendlog:lastvalue:${registerId}:${analyzerId}`);
          if (cachedValue) {
            currentValue = parseFloat(cachedValue);
            currentTimestamp = now;
            
            // Recalculate percentage change with the runtime value
            if (previousValue !== null && previousValue !== 0) {
              percentageChange = ((currentValue - previousValue) / previousValue) * 100;
            } else if (previousValue === null) {
              percentageChange = 100;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching runtime value:', error);
        // Continue with the values we have
      }
    }

    // For year filter, get monthly consumption data for both years
    if (timeFilter === 'year') {
      const currentYear = now.getFullYear();
      const previousYear = currentYear - 1;
      
      // Helper function to calculate monthly consumption
      const calculateMonthlyConsumption = async (year: number, month: number) => {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
        
        // Get first value of the month
        const firstEntry = await db.collection(collectionName)
          .find({
            trendLogId: new ObjectId(trendLogId),
            timestamp: { $gte: monthStart, $lte: monthEnd }
          })
          .sort({ timestamp: 1 })
          .limit(1)
          .toArray();
        
        // Get last value of the month
        const lastEntry = await db.collection(collectionName)
          .find({
            trendLogId: new ObjectId(trendLogId),
            timestamp: { $gte: monthStart, $lte: monthEnd }
          })
          .sort({ timestamp: -1 })
          .limit(1)
          .toArray();
        
        // Calculate consumption
        if (firstEntry.length > 0 && lastEntry.length > 0) {
          return lastEntry[0].value - firstEntry[0].value;
        }
        return 0;
      };
      
      // Get monthly consumption data for current year
      const currentYearMonthly = [];
      let currentYearTotal = 0;
      for (let month = 0; month < 12; month++) {
        const monthConsumption = await calculateMonthlyConsumption(currentYear, month);
        currentYearTotal += monthConsumption;
        
        currentYearMonthly.push({
          month,
          value: monthConsumption,
          timestamp: new Date(currentYear, month, 1)
        });
      }
      
      // Get monthly consumption data for previous year
      const previousYearMonthly = [];
      let previousYearTotal = 0;
      for (let month = 0; month < 12; month++) {
        const monthConsumption = await calculateMonthlyConsumption(previousYear, month);
        previousYearTotal += monthConsumption;
        
        previousYearMonthly.push({
          month,
          value: monthConsumption,
          timestamp: new Date(previousYear, month, 1)
        });
      }
      
      // Calculate yearly percentage change based on totals
      let yearlyPercentageChange = null;
      if (previousYearTotal !== 0) {
        yearlyPercentageChange = ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100;
      }
      
      return NextResponse.json({
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

    return NextResponse.json({
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
    console.error('Error fetching trend log entries:', error);
    return NextResponse.json({ error: 'Failed to fetch trend log entries' }, { status: 500 });
  }
}

// Helper function to aggregate data based on time filter
function aggregateData(entries: any[], timeFilter: string) {
  if (entries.length === 0) return [];

  // For hour filter, show data as-is or aggregate by minutes
  if (timeFilter === 'hour') {
    // Group by 5-minute intervals
    const grouped = new Map<string, { sum: number; count: number; timestamp: Date }>();
    
    entries.forEach(entry => {
      const date = new Date(entry.timestamp);
      const minutes = Math.floor(date.getMinutes() / 5) * 5;
      date.setMinutes(minutes, 0, 0);
      const key = date.toISOString();
      
      if (!grouped.has(key)) {
        grouped.set(key, { sum: 0, count: 0, timestamp: date });
      }
      
      const group = grouped.get(key)!;
      group.sum += entry.value;
      group.count += 1;
    });
    
    return Array.from(grouped.values())
      .map(group => ({
        timestamp: group.timestamp,
        value: group.sum / group.count
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // For day filter, group by hours
  if (timeFilter === 'day') {
    const grouped = new Map<string, { sum: number; count: number; timestamp: Date }>();
    
    entries.forEach(entry => {
      const date = new Date(entry.timestamp);
      date.setMinutes(0, 0, 0);
      const key = date.toISOString();
      
      if (!grouped.has(key)) {
        grouped.set(key, { sum: 0, count: 0, timestamp: date });
      }
      
      const group = grouped.get(key)!;
      group.sum += entry.value;
      group.count += 1;
    });
    
    return Array.from(grouped.values())
      .map(group => ({
        timestamp: group.timestamp,
        value: group.sum / group.count
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // For month filter, group by days
  if (timeFilter === 'month') {
    const grouped = new Map<string, { sum: number; count: number; timestamp: Date }>();
    
    entries.forEach(entry => {
      const date = new Date(entry.timestamp);
      date.setHours(0, 0, 0, 0);
      const key = date.toISOString();
      
      if (!grouped.has(key)) {
        grouped.set(key, { sum: 0, count: 0, timestamp: date });
      }
      
      const group = grouped.get(key)!;
      group.sum += entry.value;
      group.count += 1;
    });
    
    return Array.from(grouped.values())
      .map(group => ({
        timestamp: group.timestamp,
        value: group.sum / group.count
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // For year filter, group by months
  if (timeFilter === 'year') {
    const grouped = new Map<string, { sum: number; count: number; timestamp: Date }>();
    
    entries.forEach(entry => {
      const date = new Date(entry.timestamp);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      const key = date.toISOString();
      
      if (!grouped.has(key)) {
        grouped.set(key, { sum: 0, count: 0, timestamp: date });
      }
      
      const group = grouped.get(key)!;
      group.sum += entry.value;
      group.count += 1;
    });
    
    return Array.from(grouped.values())
      .map(group => ({
        timestamp: group.timestamp,
        value: group.sum / group.count
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Default: return as-is
  return entries;
}