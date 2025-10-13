import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { cloudBridgeAgent } from '@/lib/cloud-bridge-agent';

export async function POST(req: NextRequest) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const body = await req.json();
    const { serverIp } = body;
    
    if (!serverIp) {
      return NextResponse.json({
        success: false,
        message: 'Domain address is required'
      }, { status: 400 });
    }

    // Construct the server URL with HTTPS and port 443
    const serverUrl = `https://${serverIp}:443`;

    // Use Cloud Bridge Agent to test the connection
    const testResult = await cloudBridgeAgent.testConnection(serverUrl);

    // WebSocket testing will be done client-side
    // We can't easily test WebSocket connection from server-side in Next.js

    return NextResponse.json({
      success: true,
      httpSuccess: testResult.success,
      wsTestRequired: true, // Indicates client should test WebSocket
      message: testResult.message
    });
    
  } catch (error) {
    console.error('Error testing connection:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to test connection' 
    }, { status: 500 });
  }
}