import { NextResponse } from 'next/server';
import { machineIdSync } from 'node-machine-id';

// Bu API'yi Go sunucusuna taşımadık çünkü:
// 1. Gizli anahtarlar içermiyor
// 2. Makine ID'sini direkt olarak node-machine-id ile alabiliyoruz
// 3. Basit bir işlem olduğu için taşımaya gerek yok

export async function GET() {
  try {
    const id = machineIdSync(true); // deterministic: true
    return NextResponse.json({ machineId: id });
  } catch (err) {
    return NextResponse.json({ machineId: null }, { status: 500 });
  }
}