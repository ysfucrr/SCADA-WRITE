import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';

// Kullanıcı güncelleme
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
 
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;

    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin' && session.user.permissions?.users === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    // Gelen verileri al, kullanıcı adı düzenlenemez olduğundan artık zorunlu değil
    const { password, permissions, buildingPermissions } = await request.json();
    console.log('Received data:', { password, permissions, buildingPermissions });
    const { db } = await connectToDatabase();
    
    // Kullanıcı adını değiştirmediğimiz için benzersizlik kontrolünü kaldırıldı
    
    // Güncellenecek alanları hazırla
    const updateData: any = {
      // username artık düzenlenmiyor
      permissions: permissions || {
        billing: false,
        users: false,
        units: false,
        trendLog: false
      },
      buildingPermissions: buildingPermissions || {}
    };
    
    // Parola değiştirilecekse hashle ve ekle
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('User update failed:', error);
    return NextResponse.json({ error: 'User update failed' }, { status: 500 });
  }
}

// Kullanıcı silme
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;
    
    const session = await getServerSession(authOptions);
    
    // Session içeriğini detaylı loglama
    if (!session || session.user.role !== 'admin' && session.user.permissions?.users === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    
    const { db } = await connectToDatabase();
    
    // Debug logları
    console.log('Session user ID:', session?.user?.id, 'Type:', typeof session?.user?.id);
    console.log('Request ID to delete:', id, 'Type:', typeof id);
    
    // Kullanıcının kendisini silmesini engelle
    // Kullanıcı bilgisini veritabanından alalım
    const userToDelete = await db.collection('users').findOne({ _id: new ObjectId(id) });
    console.log('User to delete:', userToDelete);
    
    // Session.user içindeki kullanıcı adını alalım, logu ve tipi kontrol edip
    // NextAuth name alanını kullanıyor (username değil)
    console.log('Session user properties:', Object.keys(session.user));
    
    // Session'daki username ve DB'deki username'i karşılaştır
    // NextAuth.js'e username alanı eklendi
    const sessionUsername = (session.user as any).username || session.user.name;
    console.log('Session username:', sessionUsername);
    
    if (userToDelete && sessionUsername && userToDelete.username === sessionUsername) {
      console.log('Self-deletion attempt prevented');
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }
    console.log('Delete check passed: Names do not match');
    
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('User deletion failed:', error);
    return NextResponse.json({ error: 'User deletion failed' }, { status: 500 });
  }
}
