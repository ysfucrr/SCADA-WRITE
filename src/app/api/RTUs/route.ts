import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

// Kullanıcıları getir
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    // Yetki kontrolü
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { db } = await connectToDatabase();
    const rtus = await db.collection('rtus').find().toArray();

    // ObjectId'leri string'e dönüştür
    const formattedRTUs = rtus.map(rtus => ({
      ...rtus,
      _id: rtus._id.toString(),
      createdAt: rtus.createdAt ? new Date(rtus.createdAt).toISOString() : null
    }));

    return NextResponse.json(formattedRTUs);
  } catch (error) {
    console.error('RTUs could not be fetched:', error);
    return NextResponse.json({ error: 'RTUs could not be fetched' }, { status: 500 });
  }
}

// Yeni kullanıcı ekle
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { name, connectionType, ipAddress, port, baudRate, parity, stopBits } = await request.json();
    console.log(
      name,
      connectionType,
      ipAddress,
      port,
      baudRate,
      parity,
      stopBits
    )
    if (connectionType === 'serial') {
      if (!port || !baudRate || !parity || !stopBits) {
        return NextResponse.json({ error: 'Port, baud rate, parity, and stop bits are required' }, { status: 400 });
      }
    }
    const validateIP = (ipAddress: string) => {
      const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      return ipRegex.test(ipAddress);
    };
    if (connectionType === 'tcp') {
      if (!ipAddress) {
        return NextResponse.json({ error: 'IP address is required' }, { status: 400 });
      }
      if (!validateIP(ipAddress)) {
        return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 });
      }
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Kullanıcı adının benzersiz olup olmadığını kontrol et
    const existingRTU = await db.collection('rtus').findOne({ name });
    if (existingRTU) {
      return NextResponse.json({ error: 'RTU with the same name already exists' }, { status: 400 });
    }

    const newRTU = {
      name,
      connectionType,
      ipAddress,
      port,
      baudRate,
      parity,
      stopBits,
      createdAt: new Date()
    };

    const result = await db.collection('rtus').insertOne(newRTU);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      ...newRTU,
      createdAt: newRTU.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('RTU could not be added:', error);
    return NextResponse.json({ error: 'RTU could not be added' }, { status: 500 });
  }
}
