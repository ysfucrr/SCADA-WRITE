import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import mobileUsers from '@/models/mobileUser';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import * as bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

// ID ile kullanıcı getir
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid user ID' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection(mobileUsers).findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Error fetching mobile user:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch mobile user' }, { status: 500 });
  }
}

// ID ile kullanıcı güncelle
export async function PUT(
   request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    
    // Mevcut kullanıcıyı kontrol et
    const { db } = await connectToDatabase();
    const existingUser = await db.collection(mobileUsers).findOne({ _id: new ObjectId(id) });
    
    if (!existingUser) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    
    // Güncellenecek alanları hazırla
    const updateData: any = {
      updatedAt: new Date()
    };
    
    // Username güncellemesi (eğer varsa)
    if (body.username && body.username.trim() !== '') {
      // Eğer username değiştiyse, benzersiz olduğunu kontrol et
      if (body.username !== existingUser.username) {
        const duplicateCheck = await db.collection(mobileUsers).findOne({ 
          username: body.username,
          _id: { $ne: new ObjectId(id) }
        });
        
        if (duplicateCheck) {
          return NextResponse.json({ success: false, message: 'Username already exists' }, { status: 400 });
        }
      }
      updateData.username = body.username;
    }
    
    // İzin seviyesi güncellemesi
    if (body.permissionLevel && ['read', 'readwrite', 'admin'].includes(body.permissionLevel)) {
      updateData.permissionLevel = body.permissionLevel;
    }
    
    // Şifre güncellemesi (eğer varsa)
    if (body.password && body.password.length >= 6) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }
    
    // Kullanıcıyı güncelle
    await db.collection(mobileUsers).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    // Güncellenmiş kullanıcıyı getir (şifre olmadan)
    const updatedUser = await db.collection(mobileUsers).findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );
    
    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating mobile user:', error);
    return NextResponse.json({ success: false, message: 'Failed to update mobile user' }, { status: 500 });
  }
}

// ID ile kullanıcı sil
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session check
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid user ID' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Kullanıcıyı sil
    const result = await db.collection(mobileUsers).deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting mobile user:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete mobile user' }, { status: 500 });
  }
}