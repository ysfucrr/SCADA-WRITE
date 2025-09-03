import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import clientPromise from "@/lib/mongodb";

// Title'ı almak için GET endpoint'i - tüm kullanıcılar erişebilir
export async function GET() {
  try {
   
    const client = await clientPromise;
    const db = client.db("scada_dashboard");
    
    // settings koleksiyonundan titleConfig belgesini al
    const titleConfig = await db.collection("settings").findOne({ key: "titleConfig" });
    
    // Eğer title yoksa varsayılan değeri döndür
    const title = titleConfig?.value || "Admin";
    
    return NextResponse.json({ title, success: true });
  } catch (error) {
    console.error("Failed to fetch title:", error);
    return NextResponse.json(
      { error: "Failed to fetch title", success: false },
      { status: 500 }
    );
  }
}

// Title'ı güncellemek için PUT endpoint'i - sadece admin kullanıcılar erişebilir
export async function PUT(request: NextRequest) {
  try {
    
    const session = await getServerSession(authOptions);
    
    // Admin değilse erişim engelle
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 403 }
      );
    }

    // Request body'den yeni title'ı al
    const { title } = await request.json();
    
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required", success: false },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("scada_dashboard");
    
    // Ayarı güncelle (upsert: true ile yoksa oluştur, varsa güncelle)
    await db.collection("settings").updateOne(
      { key: "titleConfig" },
      { $set: { value: title, updatedAt: new Date() } },
      { upsert: true }
    );
    
    return NextResponse.json({ title, success: true });
  } catch (error) {
    console.error("Failed to update title:", error);
    return NextResponse.json(
      { error: "Failed to update title", success: false },
      { status: 500 }
    );
  }
}
