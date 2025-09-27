import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// Get a specific configuration by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog !== true) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid configuration ID' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const config = await db.collection('multi_log_configs').findOne({
      _id: new ObjectId(id),
      userId: session.user.id
    });

    if (!config) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to fetch multi-log configuration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration' }, 
      { status: 500 }
    );
  }
}

// Delete a specific configuration
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog !== true) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !ObjectId.isValid(id)) {
      console.log(`Invalid multi-log configuration ID format: ${id}`);
      return NextResponse.json({ error: 'Invalid configuration ID' }, { status: 400 });
    }

    console.log(`Attempting to delete multi-log configuration: ${id}`);
    const { db } = await connectToDatabase();
    
    // Önce konfigürasyonun var olup olmadığını kontrol et
    const existingConfig = await db.collection('multi_log_configs').findOne({
      _id: new ObjectId(id)
    });
    
    if (!existingConfig) {
      console.log(`Configuration ${id} not found, it may have been deleted already`);
      // Kullanıcıya daha dostça bir hata mesajı döndür - sanki başarılı olmuş gibi
      return NextResponse.json({
        success: true,
        message: 'Configuration already deleted or does not exist',
        alreadyDeleted: true
      });
    }
    
    // Kullanıcı bu konfigürasyonu silme yetkisine sahip mi?
    if (existingConfig.userId !== session.user.id && session.user.role !== 'admin') {
      console.log(`User ${session.user.id} not authorized to delete config ${id}`);
      return NextResponse.json({ error: 'Not authorized to delete this configuration' }, { status: 403 });
    }
    
    // Konfigürasyonu sil
    const result = await db.collection('multi_log_configs').deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      console.log(`Failed to delete configuration ${id}, but it exists`);
      return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 });
    }

    console.log(`Successfully deleted multi-log configuration ${id}`);
    return NextResponse.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete multi-log configuration:', error);
    return NextResponse.json(
      { error: 'Failed to delete configuration' },
      { status: 500 }
    );
  }
}