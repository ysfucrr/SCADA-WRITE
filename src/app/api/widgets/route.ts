import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

/**
 * Tüm widget'ları getir
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const widgets = await db.collection("widgets").find({}).sort({ createdAt: 1 }).toArray();
    return NextResponse.json(widgets);
  } catch (error) {
    console.error("Error fetching widgets:", error);
    return NextResponse.json({
      message: "Widget'lar alınırken bir hata oluştu",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

/**
 * Yeni widget oluştur
 */
export async function POST(request: Request) {
  try {
    // Request body'sini doğrula
    let widget;
    try {
      widget = await request.json();
    } catch (e) {
      return NextResponse.json({ message: "Geçersiz JSON formatı" }, { status: 400 });
    }
    
    // Zorunlu alanları kontrol et
    if (!widget.title) {
      return NextResponse.json({ message: "Widget başlığı zorunludur" }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Widget'ların dışına çıkamayacağı sınırları tanımla
    const BOUNDARY = {
      LEFT: 260, // Sol menü genişliği
      TOP: 290,  // Üst alan yüksekliği (sekme alanı ve başlık)
      RIGHT: 20, // Sağ kenardan boşluk
      BOTTOM: 20 // Alt kenardan boşluk
    };
    
    // Mevcut widget sayısını al ve buna göre yeni widget'ın pozisyonunu belirle
    const widgetCount = await db.collection("widgets").countDocuments();
    
    // Güvenli grid sistemi - widget'ların güvenli bir şekilde yerleştirilmesi
    // Varsayılan grid boyutu
    const GRID_WIDTH = 650;  // İki widget arası yatay mesafe
    const GRID_HEIGHT = 450; // İki widget arası dikey mesafe
    
    // Sınırlar içinde başlangıç pozisyonu
    const defaultPosition = {
      x: Math.max(BOUNDARY.LEFT, 200 + (widgetCount % 3) * GRID_WIDTH), // Sol sınırdan başla
      y: Math.max(BOUNDARY.TOP, 200 + Math.floor(widgetCount / 3) * GRID_HEIGHT) // Üst sınırdan başla
    };
    
    // Varsayılan değerleri ekle
    const newWidget = {
      ...widget,
      createdAt: new Date(),
      registers: widget.registers || [], // registers yoksa boş array olarak başlat
      position: widget.position || defaultPosition // kademeli artan pozisyon
    }
    
    await db.collection("widgets").insertOne(newWidget);
    
    return NextResponse.json(newWidget, { status: 201 });
  } catch (error) {
    console.error("Error creating widget:", error);
    return NextResponse.json({
      message: "Widget oluşturulurken bir hata oluştu",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}