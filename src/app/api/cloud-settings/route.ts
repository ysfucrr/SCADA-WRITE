import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import cloudSettings from '@/models/cloudSettings';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { cloudBridgeAgent } from '@/lib/cloud-bridge-agent';
import { machineIdSync } from 'node-machine-id';

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
        httpsPort: 443,
        agentName: ''
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
    const { serverIp, agentName } = body;
    
    // Validate required fields
    if (!serverIp) {
      return NextResponse.json({ success: false, message: 'Domain address is required' }, { status: 400 });
    }
    
    // Domain validation
    const domainRegex = /^([a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(serverIp)) {
      return NextResponse.json({ success: false, message: 'Please enter a valid domain address' }, { status: 400 });
    }
    
    // Agent name validation
    if (!agentName || agentName.trim() === '') {
      return NextResponse.json({ success: false, message: 'Agent name is required' }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Generate unique machine ID for this installation (last 8 characters)
    let machineId;
    try {
      const fullMachineId = machineIdSync();
      // Take the last 8 characters of the machine ID to keep it shorter but still unique
      machineId = fullMachineId.substring(Math.max(0, fullMachineId.length - 8));
      console.log(`Using machine ID (last 8 chars): ${machineId}`);
    } catch (error) {
      console.error("Error getting machine ID:", error);
      // Fallback to a timestamp-based ID if machine ID can't be retrieved
      machineId = Date.now().toString(36).substring(0, 8);
      console.log(`Using fallback timestamp-based ID: ${machineId}`);
    }
    
    // Check if settings already exist
    const existingSettings = await db.collection(cloudSettings).findOne({});
    
    if (existingSettings) {
      // Update existing settings but preserve machine ID if it already exists
      await db.collection(cloudSettings).updateOne(
        { _id: existingSettings._id },
        {
          $set: {
            serverIp,
            httpsPort: 443, // Sabit HTTPS portu
            agentName, // Agent name'i ekle
            machineId: existingSettings.machineId || machineId, // Use existing machine ID or new one
            updatedAt: new Date()
          }
        }
      );
    } else {
      // Create new settings with machine ID
      await db.collection(cloudSettings).insertOne({
        serverIp,
        httpsPort: 443, // Sabit HTTPS portu
        agentName, // Agent name'i ekle
        machineId, // Add machine ID
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