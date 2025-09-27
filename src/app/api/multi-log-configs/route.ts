import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// Get all configurations for current user
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog !== true) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const configs = await db.collection('multi_log_configs')
      .find({ userId: session.user.id })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json(configs);
  } catch (error) {
    console.error('Failed to fetch multi-log configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configurations' }, 
      { status: 500 }
    );
  }
}

// Create a new configuration
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog !== true) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { name, trendLogIds, logLimit, refreshRate } = await request.json();

    if (!trendLogIds || !Array.isArray(trendLogIds)) {
      return NextResponse.json(
        { error: 'Trend log IDs are required and must be an array' }, 
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Check if configuration with the same name exists for the user
    const existingConfig = await db.collection('multi_log_configs').findOne({
      userId: session.user.id,
      name: name
    });

    const timestamp = new Date();
    let responseId: string;

    if (existingConfig) {
      // Update existing configuration
      await db.collection('multi_log_configs').updateOne(
        { _id: existingConfig._id },
        {
          $set: {
            trendLogIds,
            logLimit: logLimit || 100,
            refreshRate: refreshRate || 30,
            updatedAt: timestamp
          }
        }
      );
      responseId = existingConfig._id.toString();
    } else {
      // Create new configuration
      const insertResult = await db.collection('multi_log_configs').insertOne({
        userId: session.user.id,
        name: name || 'Default Configuration',
        trendLogIds,
        logLimit: logLimit || 100,
        refreshRate: refreshRate || 30,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      responseId = insertResult.insertedId.toString();
    }

    return NextResponse.json({
      success: true,
      message: existingConfig ? 'Configuration updated' : 'Configuration created',
      id: responseId
    }, { status: 201 });

  } catch (error) {
    console.error('Failed to save multi-log configuration:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' }, 
      { status: 500 }
    );
  }
}