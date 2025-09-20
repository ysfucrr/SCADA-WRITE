import { NextResponse } from 'next/server';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { connectToDatabase } from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    const { registerId, value } = await request.json();

    if (!registerId || value === undefined || value === null) {
      return NextResponse.json({ error: 'registerId and value are required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Güvenlik ve doğrulama: `registerId`'nin gerçekten `buildings` koleksiyonunda var olduğunu doğrula.
    // Bu, rastgele ID'lerle sisteme istek gönderilmesini engeller.
    const building = await db.collection('buildings').findOne({
      $or: [
        { "flowData.nodes.id": registerId },
        { "floors.flowData.nodes.id": registerId },
        { "floors.rooms.flowData.nodes.id": registerId }
      ]
    });
    
    if (!building) {
        backendLogger.warning('Write request for non-existent registerId', 'API/write', { registerId });
        return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    }

    // Güvenli bir şekilde isteği veritabanına yazalım.
    // service_new.ts bu koleksiyondaki yeni dökümanları dinleyecek.
    await db.collection('write_requests').insertOne({
      registerId,
      value,
      createdAt: new Date(),
      status: 'pending' // İşlem durumu
    });

    backendLogger.info('Write request saved to database', 'API/write', { registerId, value });

    return NextResponse.json({ success: true, message: 'Write request successfully queued.' });

  } catch (error) {
    backendLogger.error('Failed to process write request', 'API/write', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to process write request' }, { status: 500 });
  }
}