import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const body = await req.json();
    const { serverIp, httpPort, wsPort } = body;
    
    if (!serverIp || !httpPort || !wsPort) {
      return NextResponse.json({ 
        success: false, 
        message: 'Server IP, HTTP Port and WebSocket Port are required' 
      }, { status: 400 });
    }

    // Test HTTP connection
    let httpSuccess = false;
    let httpMessage = '';
    
    try {
      // Set timeout to 5 seconds
      const response = await axios.get(`http://${serverIp}:${httpPort}/health`, { 
        timeout: 5000 
      });
      
      httpSuccess = response.status === 200;
      httpMessage = httpSuccess ? 
        'HTTP connection successful' : 
        'HTTP connection responded but with unexpected status';
      
    } catch (err) {
      console.error('HTTP connection test failed:', err);
      httpMessage = 'HTTP connection failed';
    }

    // WebSocket testing will be done client-side
    // We can't easily test WebSocket connection from server-side in Next.js

    return NextResponse.json({ 
      success: true, 
      httpSuccess, 
      wsTestRequired: true, // Indicates client should test WebSocket
      message: httpMessage
    });
    
  } catch (error) {
    console.error('Error testing connection:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to test connection' 
    }, { status: 500 });
  }
}