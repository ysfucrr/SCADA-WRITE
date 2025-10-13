import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    // Validate input
    if (!username) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Username is required' 
        },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await connectToDatabase();

    // Find user
    const user = await db.collection('mobile_users').findOne({ 
      username: username.toLowerCase() 
    });

    if (!user) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'User not found' 
        },
        { status: 404 }
      );
    }

    // Check if user is active (optional field)
    if (user.isActive === false) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'User account is disabled' 
        },
        { status: 403 }
      );
    }

    // Return success with user info (without password)
    return NextResponse.json({
      success: true,
      valid: true,
      user: {
        id: user._id,
        username: user.username,
        permissionLevel: user.permissionLevel || 'read'
      }
    });

  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}