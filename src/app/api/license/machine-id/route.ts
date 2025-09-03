import { NextResponse } from 'next/server';
import { machineIdSync } from 'node-machine-id';

export async function GET() {
  try {
    const id = machineIdSync(true); // deterministic: true
    return NextResponse.json({ machineId: id });
  } catch (err) {
    return NextResponse.json({ machineId: null }, { status: 500 });
  }
}