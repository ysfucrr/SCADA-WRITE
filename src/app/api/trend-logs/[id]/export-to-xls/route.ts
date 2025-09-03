import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false && session.user.permissions?.dashboard === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { id } = await params;
   

    const { db } = await connectToDatabase();
    
    // Trend log bilgilerini veritabanından al
    const trendLog = await db.collection('trendLogs').findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!trendLog) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    
    // İlgili kayıtları veritabanından al
    const trendLogEntries = await db.collection('trend_log_entries')
      .find({ 
        trendLogId: id,
      })
      .sort({ timestamp: 1 })
      .toArray();

    // CSV formatına çevir
    const headers = ['Timestamp', 'Value'];
    const rows = trendLogEntries.map(entry => [
      new Date(entry.timestamp).toISOString(),
      entry.value
    ]);
    
    // CSV veri oluşturma
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // İndirme işlemi için response header'larını ayarla
    const filename = `trend_log_${id}_${new Date().toISOString().slice(0,10)}.csv`;
    
    // İndirilen kayıtları veritabanında exported olarak işaretle
    // await db.collection('trend_log_entries').updateMany(
    //   { trendLogId: id, exported: { $exists: false } },
    //   { $set: { exported: true, exportDate: new Date() } }
    // );
    
    // CSV dosyası olarak dönüş yap
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=${filename}`
      }
    });
    
  } catch (error) {
    console.error('Export to XLS failed:', error);
    return NextResponse.json({ error: 'Export to XLS failed' }, { status: 500 });
  }
}
