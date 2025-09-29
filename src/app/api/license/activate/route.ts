import { NextRequest, NextResponse } from 'next/server';
import { machineIdSync } from 'node-machine-id';

// License server URL
const LICENSE_SERVER_URL = "http://localhost:3002";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = (formData as any).get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Missing license file' });
    }

    // Makine ID'sini al
    const actualMachineId = machineIdSync(true);

    // Yeni form oluştur
    const newFormData = new FormData();
    newFormData.append('file', file);

    // Go sunucusuna istek gönder
    const serverResponse = await fetch(`${LICENSE_SERVER_URL}/activate`, {
      method: 'POST',
      body: newFormData,
      headers: {
        'X-Machine-ID': actualMachineId
      }
    });

    const result = await serverResponse.json();

    if (!result.success) {
      return NextResponse.json(result);
    }

    // Cookie ayarla (7 gün geçerli örnek olarak)
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: 'licenseValid',
      value: 'true',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 gün
      httpOnly: true,
    });

    return response;
  } catch (err) {
    console.log(err);
    return NextResponse.json({ success: false, error: 'Invalid license file' });
  }
}