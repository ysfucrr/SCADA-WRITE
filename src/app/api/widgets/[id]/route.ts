import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

// Widget'ı güncelle
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // ID doğrulama
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid Widget ID format" }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Widget'ın var olup olmadığını kontrol et
    const existingWidget = await db.collection("widgets").findOne({ _id: new ObjectId(id) });
    if (!existingWidget) {
      return NextResponse.json({ message: "Widget not found" }, { status: 404 });
    }
    
    // Request body'sini doğrula
    let updateData;
    try {
      updateData = await request.json();
      console.log("Update received:", JSON.stringify(updateData)); // Log the received data
    } catch (e) {
      return NextResponse.json({ message: "Invalid JSON format" }, { status: 400 });
    }
    
    // _id alanını kaldır
    delete updateData._id;
    
    // Widget'ı güncelle - spesifik olarak belirtilen alanları güncelliyoruz
    const updateFields: Record<string, any> = {};
    
    // Size güncellemesi varsa
    if (updateData.size) {
      updateFields.size = updateData.size;
    }
    
    // Registers dizisi güncellemesi varsa
    if (updateData.registers && Array.isArray(updateData.registers)) {
      // Label ile ilgili alanları normal register'lardan temizle
      const cleanedRegisters = updateData.registers.map((reg: any) => {
        if (reg.dataType !== "label") {
          const cleanedReg = { ...reg };
          delete cleanedReg.labelPosition;
          delete cleanedReg.labelSize;
          return cleanedReg;
        }
        return reg;
      });
      updateFields.registers = cleanedRegisters;
    }
    
    // Başlık güncellemesi varsa
    if (updateData.title) {
      updateFields.title = updateData.title;
    }
    
    // Boş güncelleme olmasını engelle
    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
    }
    
    console.log("Fields to update:", updateFields);
    
    await db.collection("widgets").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );
    
    const updatedWidget = await db.collection("widgets").findOne({ _id: new ObjectId(id) });
    
    return NextResponse.json(updatedWidget);
  } catch (error) {
    console.error("Error updating widget:", error);
    return NextResponse.json({
      message: "Error updating widget",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

// Widget'ı sil
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // ID doğrulama
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Geçersiz Widget ID formatı" }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Widget'ın var olup olmadığını kontrol et
    const existingWidget = await db.collection("widgets").findOne({ _id: new ObjectId(id) });
    if (!existingWidget) {
      return NextResponse.json({ message: "Widget bulunamadı" }, { status: 404 });
    }
    
    // Widget'ı sil
    const result = await db.collection("widgets").deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ message: "Widget silinemedi" }, { status: 500 });
    }
    
    return NextResponse.json({ message: "Widget başarıyla silindi" });
  } catch (error) {
    console.error("Error deleting widget:", error);
    return NextResponse.json({
      message: "Widget silinirken bir hata oluştu",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

// Widget'ın register listesini getir
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // ID doğrulama
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Geçersiz Widget ID formatı" }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Widget'ı bul
    const widget = await db.collection("widgets").findOne({ _id: new ObjectId(id) });
    
    if (!widget) {
      return NextResponse.json({ message: "Widget bulunamadı" }, { status: 404 });
    }
    
    // Eğer bir query parametresi varsa sadece register'ları döndür
    const url = new URL(request.url);
    const registersOnly = url.searchParams.get("registersOnly");
    
    if (registersOnly === "true") {
      return NextResponse.json(widget.registers || []);
    }
    
    // Tüm widget verisini döndür
    return NextResponse.json(widget);
  } catch (error) {
    console.error("Error fetching widget:", error);
    return NextResponse.json({
      message: "Widget bilgileri alınırken bir hata oluştu",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}