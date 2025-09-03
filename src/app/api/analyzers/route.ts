import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const LICENSE_PATH = process.cwd() + "/license.json"

// Kullanıcıları getir
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Admin değilse erişim engelle
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const query = request.nextUrl.searchParams;
    const gateway = query.get('gateway');
    let analyzers;
    if (gateway) {
      analyzers = await db.collection('analyzers').find({ gateway: gateway }).toArray();
    }
    else {
      analyzers = await db.collection('analyzers').find().toArray();
    }

    // ObjectId'leri string'e dönüştür
    const formattedAnalyzers = analyzers.map(analyzers => ({
      ...analyzers,
      _id: analyzers._id.toString(),
      createdAt: analyzers.createdAt ? new Date(analyzers.createdAt).toISOString() : null
    }));

    return NextResponse.json(formattedAnalyzers);
  } catch (error) {
    console.error('Analyzers could not be fetched:', error);
    return NextResponse.json({ error: 'Analyzers could not be fetched' }, { status: 500 });
  }
}

// Yeni analyzer ekle
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const license = JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
    const { db } = await connectToDatabase();
    const analyzers = await db.collection('analyzers').find().toArray();
    console.log("analyzers", analyzers.length)
    console.log("license", license.maxDevices)

    if (license && analyzers.length >= license.maxDevices) {
      return NextResponse.json({ error: 'License limit exceeded' }, { status: 403 });
    }
    const { name, slaveId, model, poll, timeout, ctRadio, vtRadio, connection, gateway, unit } = await request.json();
    console.log(
      name, slaveId, model, poll, timeout, ctRadio, vtRadio, connection, gateway, unit
    )

    // Zorunlu alanların kontrolü
    const errors = [];

    if (!name) errors.push('Analyzer name is required');
    if (!gateway) errors.push('Gateway selection is required');
    if (!slaveId) errors.push('Slave ID is required');
    if (!model) errors.push('Model is required');
    if (!poll) errors.push('Poll duration is required');
    if (!timeout) errors.push('Timeout duration is required');
    if (!ctRadio) errors.push('CT Radio is required');
    if (!vtRadio) errors.push('VT Radio is required');
    if (!connection) errors.push('Connection type is required');

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    // Kullanıcı adının benzersiz olup olmadığını kontrol et
    const existingAnalyzer = await db.collection('analyzers').findOne({ name });
    if (existingAnalyzer) {
      return NextResponse.json({ error: 'Analyzer with the same name already exists' }, { status: 400 });
    }

    const newAnalyzer = {
      name,
      slaveId,
      model,
      poll,
      timeout,
      ctRadio,
      vtRadio,
      connection,
      gateway,
      unit,
      createdAt: new Date()
    };




    const result = await db.collection('analyzers').insertOne(newAnalyzer);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      ...newAnalyzer,
      createdAt: newAnalyzer.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('Analyzer could not be added:', error);
    return NextResponse.json({ error: 'Analyzer could not be added' }, { status: 500 });
  }
}
