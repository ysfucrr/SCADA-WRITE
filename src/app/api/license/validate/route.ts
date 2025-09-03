import { machineIdSync } from 'node-machine-id';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

const SECRET_KEY = "c78c89b5c28ddc4aa43b7192e2f7d7c110d3f626584347bead4ad9a68f3b689e";
const LICENSE_PATH = process.cwd() + "/license.json"

export async function GET() {
  const machineId = machineIdSync(true);

  if (!fs.existsSync(LICENSE_PATH)) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const license = JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
  const { machineId: licensedId, maxDevices, signature } = license;

  const expectedSignature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(JSON.stringify({ machineId, maxDevices }))
    .digest('hex');

  // Varsayılan cevap
  const invalidResponse = NextResponse.json({ valid: false }, { status: 200 });

  if (signature !== expectedSignature) {
    return invalidResponse;
  }

  if (licensedId !== machineId) {
    return invalidResponse;
  }
  const { db } = await connectToDatabase();

  const analyzers = await db.collection('analyzers').find().toArray();

  // ✅ Geçerliyse cookie'yi ayarla
  const response = NextResponse.json({ valid: true, maxDevices, usedAnalyzers: analyzers.length }, { status: 200 });

  response.cookies.set({
    name: 'licenseValid',
    value: 'true',
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 gün
  });

  return response;
}