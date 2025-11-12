import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';

// Kullanıcı güncelleme
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;

    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin' && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { trendLogsData, name, price, currency } = await request.json();
    console.log(name, price, currency, trendLogsData);

    if (!name || !price || !currency || !trendLogsData) {
      return NextResponse.json({ error: 'Name, price, currency and trend logs are required' }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    const trendLogs: any[] = [];

    for (const trendLogData of trendLogsData) {
      const trendLogId = new ObjectId(trendLogData._id);
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
      let firstValueEntry = await db.collection('trend_log_entries_kwh').findOne(
        { 
          trendLogId: trendLogId,
          $or: [
            { exported: false },
            { exported: { $exists: false } }
          ]
        },
        { sort: { timestamp: 1 } }
      );

      if (!firstValueEntry) {
        return NextResponse.json({ error: `First value entry not found for Trend Log: ${trendLogRecord.name}. Please ensure the trend log has recorded at least one value.` }, { status: 400 });
      }

      trendLogs.push({
        id: trendLogData._id,
        analyzerId: trendLogRecord.analyzerId,
        registerId: trendLogRecord.registerId,
        firstValue: firstValueEntry.value ?? 0,
        currentValue: currentValue,
      });
    }


    // Güncellenecek alanları hazırla
    const updateData: any = {
      name,
      price,
      currency,
      trendLogs,
      createdAt: new Date()
    };
    console.log("updateData", updateData)
    //return response during development to see logs only
    // return NextResponse.json({ success: true, message: 'billing updated successfully' });
    const result = await db.collection('billings').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'billing not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, message: 'billing updated successfully' });
  } catch (error) {
    console.error('billing update failed:', error);
    return NextResponse.json({ error: 'gateway update failed' }, { status: 500 });
  }
}

// billing silme
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;
    
    const session = await getServerSession(authOptions);
    
    // Session içeriğini detaylı loglama
    console.log('Session object:', JSON.stringify(session, null, 2));
    
    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    
    const { db } = await connectToDatabase();
    
    // Debug logları
    console.log('Session user ID:', session?.user?.id, 'Type:', typeof session?.user?.id);
    console.log('Request ID to delete:', id, 'Type:', typeof id);
    
    // billing bilgisini veritabanından alalım
    const billingToDelete = await db.collection('billings').findOne({ _id: new ObjectId(id) });
    console.log('billing to delete:', billingToDelete);
    
    if (!billingToDelete) {
      return NextResponse.json({ error: 'billing not found' }, { status: 404 });
    }
    
    // Billing silinmeden önce, exported mantığını uygula (export endpoint'teki gibi)
    // Bu sayede son değer bir sonraki billing için first value olur
    if (billingToDelete.trendLogs && billingToDelete.trendLogs.length > 0) {
      for (const trendLog of billingToDelete.trendLogs) {
        const trendLogDoc = await db.collection('trendLogs').findOne({ _id: new ObjectId(trendLog.id) });
        const isKWHCounter = trendLogDoc?.isKWHCounter;
        const isOnChange = trendLogDoc?.period === 'onChange';
        
        if (isKWHCounter) {
          // For KWH Counter logs, find the latest entry (which has the current value)
          const latestEntry = await db.collection('trend_log_entries_kwh')
            .findOne(
              { trendLogId: new ObjectId(trendLog.id), exported: { $ne: true } },
              { sort: { timestamp: -1 } }
            );
          
          if (latestEntry) {
            // Update all entries EXCEPT the latest one
            await db.collection('trend_log_entries_kwh').updateMany(
              {
                trendLogId: new ObjectId(trendLog.id),
                exported: { $ne: true },
                _id: { $ne: latestEntry._id } // En son kayıt hariç
              },
              { $set: { exported: true, exportedAt: new Date() } }
            );
          }
        } else if (isOnChange) {
          // For onChange logs, find the latest entry
          const latestEntry = await db.collection('trend_log_entries_onchange')
            .findOne(
              { trendLogId: new ObjectId(trendLog.id), exported: { $ne: true } },
              { sort: { timestamp: -1 } }
            );
          
          if (latestEntry) {
            await db.collection('trend_log_entries_onchange').updateMany(
              {
                trendLogId: new ObjectId(trendLog.id),
                exported: { $ne: true },
                _id: { $ne: latestEntry._id }
              },
              { $set: { exported: true, exportedAt: new Date() } }
            );
          }
        } else {
          // For periodic logs, find the latest entry
          const latestEntry = await db.collection('trend_log_entries')
            .findOne(
              { trendLogId: new ObjectId(trendLog.id), exported: { $ne: true } },
              { sort: { timestamp: -1 } }
            );
          
          if (latestEntry) {
            await db.collection('trend_log_entries').updateMany(
              {
                trendLogId: new ObjectId(trendLog.id),
                exported: { $ne: true },
                _id: { $ne: latestEntry._id }
              },
              { $set: { exported: true, exportedAt: new Date() } }
            );
          }
        }
      }
    }
    
    const result = await db.collection('billings').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'billing not found' }, { status: 404 });
    }
     
    return NextResponse.json({ success: true, message: 'billing deleted successfully' });
  } catch (error) {
    console.error('billing deletion failed:', error);
    return NextResponse.json({ error: 'billing deletion failed' }, { status: 500 });
  }
}
