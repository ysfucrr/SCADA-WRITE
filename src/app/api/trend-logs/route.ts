import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
// Trend logger servisini doğrudan import et - singleton pattern sayesinde her zaman aynı instance'a erişeceğiz
// Trend log'ları getir
export async function GET(request: NextRequest) {
  try {

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const query = request.nextUrl.searchParams;
    const analyzerId = query.get('analyzerId');
    const isKWHCounter = query.get('isKWHCounter');

    const { db } = await connectToDatabase();
    let trendLogs;
    if(analyzerId){
    trendLogs = await db.collection('trendLogs').find({analyzerId: analyzerId}).toArray();
    }
    else if(isKWHCounter){
    trendLogs = await db.collection('trendLogs').find({isKWHCounter: true}).toArray();
    }
    else{
      trendLogs = await db.collection('trendLogs').find({}).toArray();
    }

    // ObjectId'leri string'e dönüştür
    const formattedTrendLogs = trendLogs.map(trendLogs => ({
      ...trendLogs,
      _id: trendLogs._id.toString(),
      createdAt: trendLogs.createdAt ? new Date(trendLogs.createdAt).toISOString() : null
    }));

    return NextResponse.json(formattedTrendLogs);
  } catch (error) {
    console.error('Trend logs could not be fetched:', error);
    return NextResponse.json({ error: 'Trend logs could not be fetched' }, { status: 500 });
  }
}

// Yeni trend log ekle - Express API'sini çağır
export async function POST(request: NextRequest) {
  try {

    const body = await request.json();
    const { period,
      endDate,
      analyzerId,
      registerId,
      interval,
      address,
      isKWHCounter,
      dataType,
      byteOrder,
      scale,
    } = body;
   
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    //end date must be in the future
    if (!endDate || !analyzerId || !registerId || !period || !interval) {
      return NextResponse.json({ error: 'Period, end date, register and interval are required' }, { status: 400 });
    }
    //end date must be in the future
    if (new Date(endDate) < new Date()) {
      return NextResponse.json({ error: 'End date must be in the future' }, { status: 400 });
    }
    const { db } = await connectToDatabase();
    
    // First, fetch the current value from the service to store it immediately.
    let initialValue: number | null = null;
    try {
        const valueResponse = await fetch(`http://localhost:${process.env.SERVICE_PORT}/express-api/get-register-value?id=${registerId}`);
        if (valueResponse.ok) {
            const data = await valueResponse.json();
            initialValue = data.value;
        } else {
             console.warn(`Could not fetch initial value for register ${registerId}. It will be logged on the next cycle.`);
        }
    } catch (fetchError) {
        console.error(`Error fetching initial value for register ${registerId}:`, fetchError);
        // We don't fail the whole operation, just log the error and proceed.
    }

    const trendLog = await db.collection('trendLogs').insertOne({
      period,
      interval,
      endDate,
      analyzerId,
      registerId,
      isKWHCounter,
      address,
      dataType,
      byteOrder,
      scale,
      status: 'running', // Explicitly set status
      createdAt: new Date(),
    });

    // If we have an initial value, write it to the entries collection immediately.
    if (initialValue !== null) {
        await db.collection('trend_log_entries').insertOne({
            trendLogId: trendLog.insertedId,
            value: initialValue,
            timestamp: new Date(),
            analyzerId: analyzerId,
            registerId: registerId
        });
    }

    return NextResponse.json({ ...trendLog, insertedId: trendLog.insertedId.toString() }, { status: 201 });
  } catch (error) {
    console.error('Trend log could not be added:', error);
    return NextResponse.json({ error: 'Trend log could not be added' }, { status: 500 });
  }
}

