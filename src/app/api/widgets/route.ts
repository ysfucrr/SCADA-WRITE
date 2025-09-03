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
    if (!session || session.user.role !== 'admin' && session.user.permissions?.dashboard === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const widgets = await db.collection('widgets').find().toArray();
    const firstValues = await db.collection('trend_log_entries').find({
      $or: [
        { exported: false },
        { exported: { $exists: false } }
      ]
    }).toArray();

    widgets.forEach((widget: any) => {
      widget.trendLogs.forEach((trendLog: any) => {
        // Correctly compare the ObjectId from the entry with the string ID from the widget
        const matchingEntry = firstValues.find(firstValue => firstValue.trendLogId.toString() === trendLog.id);
        trendLog.firstValue = matchingEntry ? matchingEntry.value : 0;
      });
    });
    // ObjectId'leri string'e dönüştür
    const formattedWidgets = widgets.map(widget => ({
      ...widget,
      _id: widget._id.toString(),
      createdAt: widget.createdAt ? new Date(widget.createdAt).toISOString() : null
    }));

    //read firstvalues from trend_log_entries where expored is not exist or false for each trendlogs of widgets

    return NextResponse.json(formattedWidgets);
  } catch (error) {
    console.error('Widgets could not be fetched:', error);
    return NextResponse.json({ error: 'Widgets could not be fetched' }, { status: 500 });
  }
}

// Yeni kullanıcı ekle
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.dashboard === false) {
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
      const firstValueEntry = await db.collection('trend_log_entries').findOne(
        { trendLogId: trendLogId },
        { sort: { timestamp: 1 } }
      );
      
      if (!firstValueEntry) {
         return NextResponse.json({ error: `First value entry not found for Trend Log: ${trendLogRecord.name}.` }, { status: 400 });
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

    const widgetRecord = {
      name: name,
      price: price,
      currency: currency,
      trendLogs: trendLogs,
      startTime: new Date(),
      createdAt: new Date()
    };

    const result = await db.collection('widgets').insertOne(widgetRecord);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      ...widgetRecord,
      createdAt: widgetRecord.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('Widget could not be added:', error);
    return NextResponse.json({ error: 'Widget could not be added' }, { status: 500 });
  }
}
