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
    
    // Varsayılan değerleri ekle
    const newWidget = {
      ...widget,
      createdAt: new Date(),
      registers: widget.registers || [], // registers yoksa boş array olarak başlat
    }
    
    const { db } = await connectToDatabase();
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