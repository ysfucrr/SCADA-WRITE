import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { cloudBridgeAgent } from '@/lib/cloud-bridge-agent';

export async function GET() {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Get current connection status from the cloud bridge agent
    const status = cloudBridgeAgent.getConnectionStatus();
    
    return NextResponse.json({ 
      success: true, 
      status
    });
  } catch (error) {
    console.error('Error fetching cloud bridge status:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch cloud bridge status' }, { status: 500 });
  }
}