import { NextResponse } from "next/server";
import os from 'os';
export async function GET() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
      const interfaceInfo = interfaces[interfaceName];
      for (const info of interfaceInfo!) {
        if (info.family === 'IPv4' && !info.internal) {
          return NextResponse.json({ success: true, ip: info.address });
        }
      }
    }
    return NextResponse.json({ success: true, ip: '127.0.0.1' });
}
