import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import cloudSettings from '@/models/cloudSettings';
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

    const { db } = await connectToDatabase();
    const settings = await db.collection(cloudSettings).findOne({});
    
    return NextResponse.json({ 
      success: true, 
      settings: settings || { 
        serverIp: '', 
        httpPort: 4000, 
        wsPort: 4001 
      } 
    });
  } catch (error) {
    console.error('Error fetching cloud settings:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch cloud settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const body = await req.json();
    const { serverIp, httpPort, wsPort } = body;
    
    // Validate required fields
    if (!serverIp) {
      return NextResponse.json({ success: false, message: 'Server IP is required' }, { status: 400 });
    }
    
    if (!httpPort || typeof httpPort !== 'number') {
      return NextResponse.json({ success: false, message: 'Valid HTTP Port is required' }, { status: 400 });
    }
    
    if (!wsPort || typeof wsPort !== 'number') {
      return NextResponse.json({ success: false, message: 'Valid WebSocket Port is required' }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Check if settings already exist
    const existingSettings = await db.collection(cloudSettings).findOne({});
    
    if (existingSettings) {
      // Update existing settings
      await db.collection(cloudSettings).updateOne(
        { _id: existingSettings._id },
        { 
          $set: { 
            serverIp, 
            httpPort, 
            wsPort,
            updatedAt: new Date()
          } 
        }
      );
    } else {
      // Create new settings
      await db.collection(cloudSettings).insertOne({
        serverIp,
        httpPort,
        wsPort,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Ayarlar başarıyla kaydedildikten sonra bağlantıyı yeniden kurma girişimi yap
    try {
      await cloudBridgeAgent.reconnect();
    } catch (reconnectError) {
      console.warn('Failed to reconnect to Cloud Bridge after settings change:', reconnectError);
      // Bağlantı hatası durumunda bile ayarlar başarıyla kaydedildi
    }
    
    return NextResponse.json({ success: true, message: 'Cloud settings saved successfully' });
  } catch (error) {
    console.error('Error saving cloud settings:', error);
    return NextResponse.json({ success: false, message: 'Failed to save cloud settings' }, { status: 500 });
  }
}