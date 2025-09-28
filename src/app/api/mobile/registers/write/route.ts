import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için register yazma endpoint'i
export async function POST(request: NextRequest) {
  try {
    const { registerId, value } = await request.json();

    if (!registerId || value === undefined || value === null) {
      return NextResponse.json({ 
        error: 'registerId and value are required',
        success: false 
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Write request'i MongoDB'ye ekle
    const writeRequest = {
      registerId,
      value: Number(value),
      timestamp: new Date(),
      source: 'mobile-app',
      status: 'pending'
    };

    const result = await db.collection('write_requests').insertOne(writeRequest);

    if (result.insertedId) {
      return NextResponse.json({
        success: true,
        message: 'Write request submitted successfully',
        requestId: result.insertedId.toString(),
        registerId,
        value: Number(value)
      });
    } else {
      throw new Error('Failed to insert write request');
    }

  } catch (error) {
    console.error('Mobile register write error:', error);
    return NextResponse.json({ 
      error: 'Write request could not be processed',
      success: false 
    }, { status: 500 });
  }
}

// GET endpoint to check write request status
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const requestId = url.searchParams.get('requestId');

    if (!requestId) {
      return NextResponse.json({ 
        error: 'requestId parameter is required',
        success: false 
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const writeRequest = await db.collection('write_requests').findOne({
      _id: new (require('mongodb')).ObjectId(requestId)
    });

    if (!writeRequest) {
      return NextResponse.json({ 
        error: 'Write request not found',
        success: false 
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      status: writeRequest.status,
      registerId: writeRequest.registerId,
      value: writeRequest.value,
      timestamp: writeRequest.timestamp
    });

  } catch (error) {
    console.error('Mobile write request status error:', error);
    return NextResponse.json({ 
      error: 'Write request status could not be fetched',
      success: false 
    }, { status: 500 });
  }
}