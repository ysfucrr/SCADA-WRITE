import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// bcrypt'i dynamic import ile yükle
const bcrypt = require('bcrypt');

// Mobile app için authentication endpoint'i
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({
        error: 'Username and password are required',
        success: false
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    console.log(`Mobile auth attempt for username: ${username}`);
    
    // Kullanıcıyı users koleksiyonundan bul
    const user = await db.collection('users').findOne({
      username: username.toLowerCase()
    });

    console.log(`User found in database:`, user ? 'Yes' : 'No');
    
    if (!user) {
      // Demo kullanıcı kontrolü
      if (username.toLowerCase() === 'admin' && password === 'admin') {
        console.log('Using demo admin credentials');
        const demoUser = {
          _id: 'demo-admin',
          username: 'admin',
          email: 'admin@demo.com',
          role: 'admin',
          permissions: {},
          isActive: true
        };
        
        const userResponse = {
          _id: demoUser._id,
          username: demoUser.username,
          email: demoUser.email,
          role: demoUser.role,
          permissions: demoUser.permissions,
          isActive: demoUser.isActive,
          loginTime: new Date().toISOString()
        };

        return NextResponse.json({
          success: true,
          message: 'Login successful (demo)',
          user: userResponse
        });
      }
      
      return NextResponse.json({
        error: 'Invalid username or password',
        success: false
      }, { status: 401 });
    }

    // Gerçek kullanıcı için bcrypt şifre kontrolü
    console.log('Checking password for real user with bcrypt');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log('Password validation failed');
      return NextResponse.json({
        error: 'Invalid username or password',
        success: false
      }, { status: 401 });
    }
    
    console.log('Authentication successful for real user');

    // Başarılı giriş
    const userResponse = {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      loginTime: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      user: userResponse
    });

  } catch (error) {
    console.error('Mobile auth error:', error);
    return NextResponse.json({ 
      error: 'Authentication failed',
      success: false 
    }, { status: 500 });
  }
}