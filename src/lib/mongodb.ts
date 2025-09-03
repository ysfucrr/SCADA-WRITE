import { MongoClient } from 'mongodb';
import { backendLogger } from './logger/BackendLogger';

// Sabit bağlantı dizesi kullanıyoruz
const MONGODB_URI = process.env.MONGODB_URI!;

// Bağlantı dizesi kontrolü
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined');
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  var _mongoClientPromise: Promise<MongoClient>;
}

if (process.env.NODE_ENV === 'development') {
  // Geliştirme ortamında global değişkeni kullan
  if (!global._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // Üretim ortamında yeni bir bağlantı oluştur
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

// Ensure the connection is working
clientPromise.then(() => {
  backendLogger.info('MongoDB connection successful!', 'MongoDB');
}).catch(err => {
  backendLogger.error('MongoDB connection error: ' + (err instanceof Error ? err.message : String(err)), 'MongoDB', { error: err instanceof Error ? err.stack : String(err) });
});

// Veritabanına bağlanma fonksiyonu
export async function connectToDatabase() {
  const client = await clientPromise;
  const db = client.db();
  return { client, db };
}

export default clientPromise;