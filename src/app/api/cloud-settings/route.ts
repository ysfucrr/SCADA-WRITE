import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

interface CloudSettingsData {
  serverIP: string;
  serverPort: string;
  isEnabled: boolean;
  lastConnectionTest?: Date;
  connectionStatus?: 'connected' | 'disconnected' | 'testing';
}

// POST /api/cloud-settings - Cloud ayarlarını kaydet/güncelle
export async function POST(request: NextRequest) {
  try {
    const settings: CloudSettingsData = await request.json();

    // Validation
    if (!settings.serverIP || !settings.serverPort) {
      return NextResponse.json({
        error: 'Server IP and port are required',
        success: false
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Cloud settings koleksiyonunu kullan (yoksa oluştur)
    const cloudSettings = {
      ...settings,
      lastConnectionTest: settings.lastConnectionTest ? new Date(settings.lastConnectionTest) : new Date(),
      updatedAt: new Date()
    };

    // Upsert işlemi - varsa güncelle, yoksa oluştur
    const result = await db.collection('cloud_settings').updateOne(
      { type: 'cloud_settings' }, // Tek bir settings dokümanı tut
      { $set: cloudSettings },
      { upsert: true }
    );

    console.log('Cloud settings saved:', {
      serverIP: settings.serverIP,
      serverPort: settings.serverPort,
      isEnabled: settings.isEnabled,
      upserted: result.upsertedCount > 0,
      modified: result.modifiedCount > 0
    });

    return NextResponse.json({
      success: true,
      message: 'Cloud settings saved successfully',
      data: cloudSettings,
      upserted: result.upsertedCount > 0,
      modified: result.modifiedCount > 0
    });

  } catch (error) {
    console.error('Cloud settings save error:', error);
    return NextResponse.json({
      error: 'Failed to save cloud settings',
      success: false
    }, { status: 500 });
  }
}

// GET /api/cloud-settings - Cloud ayarlarını getir
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    // Cloud settings'i getir
    const settings = await db.collection('cloud_settings').findOne({ type: 'cloud_settings' });

    if (!settings) {
      // Varsayılan ayarları döndür
      const defaultSettings: CloudSettingsData = {
        serverIP: '',
        serverPort: '3000',
        isEnabled: false,
        connectionStatus: 'disconnected'
      };

      return NextResponse.json({
        success: true,
        settings: defaultSettings,
        message: 'Default cloud settings returned'
      });
    }

    // ObjectId'yi string'e çevir
    const formattedSettings = {
      ...settings,
      _id: settings._id.toString(),
      lastConnectionTest: settings.lastConnectionTest ? new Date(settings.lastConnectionTest).toISOString() : null,
      updatedAt: settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null
    };

    return NextResponse.json({
      success: true,
      settings: formattedSettings
    });

  } catch (error) {
    console.error('Cloud settings fetch error:', error);
    return NextResponse.json({
      error: 'Failed to fetch cloud settings',
      success: false
    }, { status: 500 });
  }
}

// DELETE /api/cloud-settings - Cloud ayarlarını sıfırla
export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const result = await db.collection('cloud_settings').deleteOne({ type: 'cloud_settings' });

    console.log('Cloud settings deleted:', result.deletedCount > 0);

    return NextResponse.json({
      success: true,
      message: 'Cloud settings reset successfully',
      deleted: result.deletedCount > 0
    });

  } catch (error) {
    console.error('Cloud settings delete error:', error);
    return NextResponse.json({
      error: 'Failed to delete cloud settings',
      success: false
    }, { status: 500 });
  }
}