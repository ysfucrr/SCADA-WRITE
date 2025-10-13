import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import * as bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Username and password are required' 
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
          message: 'Invalid username or password' 
        },
        { status: 401 }
      );
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid username or password' 
        },
        { status: 401 }
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

    // Update last login
    await db.collection('mobile_users').updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLogin: new Date(),
          lastLoginIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        } 
      }
    );

    // Return user info (without password)
    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        permissionLevel: user.permissionLevel || 'read',
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}