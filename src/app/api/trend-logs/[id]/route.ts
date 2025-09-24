import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { backendLogger } from '@/lib/logger/BackendLogger';
// Trend logger servisini doğrudan import et

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { id } = await params;
    const { db } = await connectToDatabase();
    const trendLog = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    if (!trendLog) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    const trendLogData = await db.collection('trend_log_entries').find({ trendLogId: new ObjectId(id)}).toArray();
    // const trendLogData = await db.collection('trend_log_entries').find({ trendLogId: new ObjectId(id), $or: [{ exported: { $exists: false } }, { exported: false } ] }).toArray();
    return NextResponse.json({ trendLog, trendLogData });
  } catch (error) {
    console.error('Trend log fetch failed:', error);
    return NextResponse.json({ error: 'Trend log fetch failed' }, { status: 500 });
  }
}
// Trend log güncelleme
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
   
    const { id } = await params;

    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const body = await request.json();
    const { period, endDate, isKWHCounter, interval } = body;

    // Basic validation for fields that can be updated.
    if (!endDate || !period || !interval) {
      return NextResponse.json({ error: 'Period, end date, and interval are required' }, { status: 400 });
    }
    //end date must be in the future
    if (new Date(endDate) < new Date()) {
      return NextResponse.json({ error: 'End date must be in the future' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Fetch the existing log to prevent changing critical, non-editable fields.
    const existingLog = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    if (!existingLog) {
        return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }

    // Only allow updating specific fields. Critical identifiers are preserved.
    const updateData: any = {
      ...existingLog, // Start with existing data
      period,
      endDate,
      isKWHCounter,
      interval,
      updatedAt: new Date()
    };
    
    //We need to delete _id from updateData because it cannot be updated.
    delete updateData._id;


    const result = await db.collection('trendLogs').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    
    // The service layer will automatically handle the restart due to the database change.
    // No need to call stop/start manually anymore.

    return NextResponse.json({ success: true, message: 'Trend log updated successfully' });
  } catch (error) {
    console.error('Trend log update failed:', error);
    return NextResponse.json({ error: 'Trend log update failed' }, { status: 500 });
  }
}

// Trend log silme
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;

    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { db } = await connectToDatabase();

    // Trend log'yu silmesini engelle
    // Trend log bilgisini veritabanından alalım
    const trendLogToDelete = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    console.log('Trend log to delete:', trendLogToDelete);
    //check if any billing exist which has this trendlog in trendlogs array. this is sample billing record:

    // Trend log ID'sini trendLogs dizisindeki nesnelerin id alanında ara
    const billing = await db.collection('billings').findOne({ 'trendLogs.id': id });
    if (billing) {
      return NextResponse.json({ error: 'Cannot delete this trend log because it is used in a billing' }, { status: 400 });
    }
    const result = await db.collection('trendLogs').deleteOne({ _id: new ObjectId(id) });
    
    // Express API'sini çağırarak trend logger'ı durdur
    const stopLoggerResponse = await fetch(`http://localhost:${process.env.SERVICE_PORT}/express-api/stop-logger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    });
    
    if (!stopLoggerResponse.ok) {
      console.error('Trend logger could not be stopped via Express API');
    }
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    // Also delete all associated log entries
    const trendLogEntries = await db.collection('trend_log_entries').deleteMany({ trendLogId: new ObjectId(id) });
    backendLogger.info(`${trendLogEntries.deletedCount} trend log entries deleted for trend log ${id}.`, 'TrendLogAPI');
    return NextResponse.json({ success: true, message: 'Trend log and its entries deleted successfully' });
  } catch (error) {
    console.error('Trend log deletion failed:', error);
    return NextResponse.json({ error: 'Trend log deletion failed' }, { status: 500 });
  }
}

