const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function main() {
  const uri = 'mongodb://scadaDashboardUser:9Ziy5gxcGMWKKPJ9@mongo:27017/scada_dashboard?authSource=admin';
  console.log('MongoDB URI:', uri);
  
  try {
    // Doğrudan MongoClient kullanarak bağlantı testi
    console.log('MongoDB bağlantısı kuruluyor...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('MongoDB bağlantısı başarılı!');
    
    // Veritabanı ve koleksiyon erişimi testi
    const db = client.db('scada_dashboard');
    console.log('Veritabanı erişimi başarılı!');
    
    // Kullanıcı koleksiyonu testi
    const users = await db.collection('users').find({}).toArray();
    console.log(`${users.length} kullanıcı bulundu.`);
    
    // Admin kullanıcısı kontrolü
    const adminUser = users.find(u => u.username === 'admin');
    console.log('Admin kullanıcısı bulundu mu:', !!adminUser);
    
    if (adminUser) {
      // Admin şifresini güncelle
      const saltRounds = 10;
      const plainPassword = '12345678';
      const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      
      // Şifre doğrulama testi
      const testResult = await bcrypt.compare(plainPassword, hashedPassword);
      console.log('Şifre doğrulama testi:', testResult);
      
      // Admin şifresini güncelle
      const updateResult = await db.collection('users').updateOne(
        { username: 'admin' },
        { $set: { password: hashedPassword } }
      );
      
      console.log(`Admin şifresi güncellendi: ${updateResult.modifiedCount} kayıt değiştirildi.`);
      console.log('Yeni şifre: 12345678');
    } else {
      // Admin kullanıcısı yoksa oluştur
      const saltRounds = 10;
      const plainPassword = '12345678';
      const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      
      const newAdmin = {
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        permissions: {
          dashboard: true,
          users: true,
          units: true,
          trendLog: true
        },
        createdAt: new Date()
      };
      
      const insertResult = await db.collection('users').insertOne(newAdmin);
      console.log(`Yeni admin kullanıcısı oluşturuldu. ID: ${insertResult.insertedId}`);
      console.log('Admin kullanıcısı: admin');
      console.log('Şifre: 12345678');
    }
    
    await client.close();
    console.log('MongoDB bağlantısı kapatıldı.');
  } catch (err) {
    console.error('Hata:', err);
  }
}

main();
