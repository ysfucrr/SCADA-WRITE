import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import bcrypt from 'bcrypt';

// Kullanıcıları getir
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin' && session.user.permissions?.users === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const users = await db.collection('users').find({ role: "user" }).toArray();

    // ObjectId'leri string'e dönüştür
    const formattedUsers = users.map(user => ({
      ...user,
      _id: user._id.toString(),
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null
    }));

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error('Users could not be fetched:', error);
    return NextResponse.json({ error: 'Users could not be fetched' }, { status: 500 });
  }
}

// Yeni kullanıcı ekle
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin' && session.user.permissions?.users === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { username, password, role, permissions, buildingPermissions } = await request.json();
    console.log('Received data:', { username, password, role, permissions, buildingPermissions });
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Kullanıcı adının benzersiz olup olmadığını kontrol et
    const existingUser = await db.collection('users').findOne({ username });
    if (existingUser) {
      return NextResponse.json({ error: 'This username is already in use' }, { status: 400 });
    }

    // Parolayı hashle
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      username,
      password: hashedPassword,
      role: role || 'user',
      permissions: permissions || (role === 'admin' ? {
        dashboard: true,
        users: true,
        units: true,
        trendLog: true
      } : {
        dashboard: false,
        users: false,
        units: false,
        trendLog: false
      }),
      buildingPermissions: buildingPermissions,
      createdAt: new Date()
    };

    const result = await db.collection('users').insertOne(newUser);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      ...newUser,
      createdAt: newUser.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('User could not be added:', error);
    return NextResponse.json({ error: 'User could not be added' }, { status: 500 });
  }
}
