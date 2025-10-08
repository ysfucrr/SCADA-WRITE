import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import mobileUsers from '@/models/mobileUser';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import * as bcrypt from 'bcrypt';

// Tüm mobile kullanıcıları getir
export async function GET() {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    // Şifreler hariç tüm kullanıcı bilgilerini getir
    const users = await db.collection(mobileUsers)
      .find({})
      .project({ password: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching mobile users:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch mobile users' }, { status: 500 });
  }
}

// Yeni mobile kullanıcı oluştur
export async function POST(req: NextRequest) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const body = await req.json();
    
    // Temel validasyon
    if (!body.username || body.username.trim() === '') {
      return NextResponse.json({ success: false, message: 'Username is required' }, { status: 400 });
    }

    if (!body.password || body.password.length < 6) {
      return NextResponse.json({ success: false, message: 'Password must be at least 6 characters' }, { status: 400 });
    }

    if (!['read', 'readwrite', 'admin'].includes(body.permissionLevel)) {
      return NextResponse.json({ success: false, message: 'Invalid permission level' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Username benzersizliğini kontrol et
    const existingUser = await db.collection(mobileUsers).findOne({ username: body.username });
    if (existingUser) {
      return NextResponse.json({ success: false, message: 'Username already exists' }, { status: 400 });
    }

    // Şifreyi hash'le
    const hashedPassword = await bcrypt.hash(body.password, 10);

    // Yeni kullanıcıyı veritabanına ekle
    const result = await db.collection(mobileUsers).insertOne({
      username: body.username,
      password: hashedPassword,
      permissionLevel: body.permissionLevel,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Şifre olmadan kullanıcı bilgilerini döndür
    const newUser = await db.collection(mobileUsers)
      .findOne({ _id: result.insertedId }, { projection: { password: 0 } });

    return NextResponse.json({ success: true, user: newUser });
  } catch (error) {
    console.error('Error creating mobile user:', error);
    return NextResponse.json({ success: false, message: 'Failed to create mobile user' }, { status: 500 });
  }
}