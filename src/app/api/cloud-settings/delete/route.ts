import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import cloudSettings from '@/models/cloudSettings';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function POST() {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    
    // Delete all documents in the cloud_settings collection
    await db.collection(cloudSettings).deleteMany({});
    
    return NextResponse.json({ 
      success: true, 
      message: 'Cloud settings deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting cloud settings:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to delete cloud settings' 
    }, { status: 500 });
  }
}