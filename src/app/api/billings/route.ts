/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';

// Kullanıcıları getir
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const billings = await db.collection('billings').find().toArray();
    
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

    billings.forEach((billing: any) => {
      if (billing.trendLogs && Array.isArray(billing.trendLogs)) {
        billing.trendLogs.forEach((trendLog: any) => {
          // Correctly compare the ObjectId from the entry with the string ID from the billing
          const matchingEntry = firstValues.find(firstValue => firstValue.trendLogId.toString() === trendLog.id);
          trendLog.firstValue = matchingEntry ? matchingEntry.value : 0;
        });
      }
    });
    // ObjectId'leri string'e dönüştür
    const formattedbillings = billings.map(billing => ({
      ...billing,
      _id: billing._id.toString(),
      createdAt: billing.createdAt ? new Date(billing.createdAt).toISOString() : null
    }));

    //read firstvalues from trend_log_entries where expored is not exist or false for each trendlogs of billings

    return NextResponse.json(formattedbillings);
  } catch (error) {
    console.error('billings could not be fetched:', error);
    return NextResponse.json({ error: 'billings could not be fetched' }, { status: 500 });
  }
}

// Yeni kullanıcı ekle
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { trendLogsData, name, price, currency } = await request.json();
    console.log(
      trendLogsData,
      name,
      price,
      currency
    )


    const { db } = await connectToDatabase();
    const trendLogs: any[] = [];

    for (let i = 0; i < trendLogsData.length; i++) {
      const trendLogData = trendLogsData[i];
      const trendLogId = new ObjectId(trendLogData._id);
      console.log("trendLogId", trendLogId)
      const trendLogRecord = await db.collection('trendLogs').findOne({ _id: trendLogId });
      if (!trendLogRecord) {
        return NextResponse.json({ error: `Trend Log not found for ID: ${trendLogId}` }, { status: 400 });
      }

      // Fetch the anlık value from the service
      let currentValue: number | null = null;
      try {
          const valueResponse = await fetch(`http://localhost:${process.env.SERVICE_PORT}/express-api/get-register-value?id=${trendLogRecord.registerId}`);
          if (valueResponse.ok) {
              const data = await valueResponse.json();
              currentValue = data.value;
          }
      } catch (fetchError) {
           console.error(`Error fetching current value for register ${trendLogRecord.registerId}:`, fetchError);
      }
      if (currentValue === null) {
        return NextResponse.json({ error: `Current value not found for register: ${trendLogRecord.registerId}. Please ensure the logger is running.` }, { status: 400 });
      }

      // Fetch the ilk value from the database
      // Billing sadece KWH Counter logları ile ilgilenir, trend_log_entries_kwh koleksiyonundan oku
      // Sadece exported: false olan ilk değeri al
      const firstValueEntry = await db.collection('trend_log_entries_kwh').findOne(
        { 
          trendLogId: trendLogId,
          $or: [
            { exported: false },
            { exported: { $exists: false } }
          ]
        },
        { sort: { timestamp: 1 }, limit: 1 }
      );
      
      if (!firstValueEntry) {
         return NextResponse.json({ error: `First value entry not found for Trend Log: ${trendLogRecord.name}. Please ensure the trend log has recorded at least one value.` }, { status: 400 });
      }

      const trendLog = {
        id: trendLogData._id,
        analyzerId: trendLogRecord.analyzerId,
        registerId: trendLogRecord.registerId,
        firstValue: firstValueEntry.value ?? 0,
        currentValue: currentValue,
      };
      trendLogs.push(trendLog);
    }

    console.log("trendLogs", trendLogs)

    const billingRecord = {
      name: name,
      price: price,
      currency: currency,
      trendLogs: trendLogs,
      startTime: new Date(),
      createdAt: new Date()
    };

    const result = await db.collection('billings').insertOne(billingRecord);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      ...billingRecord,
      createdAt: billingRecord.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('billing could not be added:', error);
    return NextResponse.json({ error: 'billing could not be added' }, { status: 500 });
  }
}
