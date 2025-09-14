import { machineIdSync } from 'node-machine-id';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

// License server URL
const LICENSE_SERVER_URL = "http://localhost:3002";

export async function GET() {
  try {
    // Makine ID'sini al
    const machineId = machineIdSync(true);
    
    // MongoDB'den analyzer sayısını al
    const { db } = await connectToDatabase();
    const analyzers = await db.collection('analyzers').find().toArray();
    const usedAnalyzers = analyzers.length;
    
    // Go sunucusuna istek gönder
    const serverResponse = await fetch(`${LICENSE_SERVER_URL}/validate`, {
      method: 'GET',
      headers: {
        'X-Machine-ID': machineId,
        'X-Used-Analyzers': usedAnalyzers.toString()
      }
    });
    
    const result = await serverResponse.json();
    
    if (!result.valid) {
      return NextResponse.json({ valid: false }, { status: 200 });
    }
    
    // Geçerliyse cookie'yi ayarla
    const response = NextResponse.json({
      valid: true,
      maxDevices: result.maxDevices,
      usedAnalyzers: usedAnalyzers
    }, { status: 200 });
    
    response.cookies.set({
      name: 'licenseValid',
      value: 'true',
      path: '/',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 gün
    });
    
    return response;
  } catch (error) {
    console.error("License validation error:", error);
    return NextResponse.json({ valid: false }, { status: 200 });
  }
}