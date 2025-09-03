import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { machineIdSync } from 'node-machine-id';

const SECRET_KEY = "c78c89b5c28ddc4aa43b7192e2f7d7c110d3f626584347bead4ad9a68f3b689e";
const LICENSE_PATH = process.cwd() + "/license.json"

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ success: false, error: 'Missing license file' });
  }

  const content = await file.text();

  try {
    const parsed = JSON.parse(content);
    const { machineId, maxDevices, signature } = parsed;

    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(JSON.stringify({ machineId, maxDevices }))
      .digest('hex');

    const actualMachineId = machineIdSync(true);

    if (expectedSignature !== signature) {
      return NextResponse.json({ success: false, error: 'Invalid signature' });
    }

    if (machineId !== actualMachineId) {
      return NextResponse.json({ success: false, error: 'Machine ID mismatch' });
    }

    // Lisansı kaydet
    writeFileSync(LICENSE_PATH, JSON.stringify(parsed, null, 2));

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
    console.log(err)
    return NextResponse.json({ success: false, error: 'Invalid license file' });
  }
}