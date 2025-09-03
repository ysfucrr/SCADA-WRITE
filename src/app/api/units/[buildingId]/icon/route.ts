import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import fs from "fs";
import path from "path";
// PUT /api/units/[id]/icon - Bina ikonu güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  console.log("PUT /api/units/[id]/icon")
  try {
    // Session kontrolü
    const session = await getServerSession(authOptions);
    const { buildingId } = await params;
    if (!session || session.user.role !== 'admin' && session.user.permissions?.units === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Parametreleri al
    const { iconPath } = await request.json();
    console.log("iconPath", iconPath)
    if (!ObjectId.isValid(buildingId)) {
      return NextResponse.json(
        { success: false, message: "Invalid building ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const building = await db.collection("buildings").findOne({ _id: new ObjectId(buildingId) });
    console.log("building", building)
    if (building?.icon) {
      try {
        const filePath = path.join(process.cwd(), "public/uploads", building.icon.replace("api/image/", ""));
        console.log("filePath", filePath)
        if (fs.existsSync(filePath)) {
          console.log("Dosya var")
          fs.rmSync(filePath);
          console.log(`Eski ikon dosyası silindi: ${filePath}`);
        }
      } catch (error) {
        console.error(`Dosya silinirken hata oluştu:`, error);
        // Dosya silinirken hata oluşsa bile işleme devam ediyoruz
      }
    }

    const result = await db.collection("buildings").updateOne(
      { _id: new ObjectId(buildingId) },
      { $set: { icon: iconPath, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }
  
    return NextResponse.json({
      success: true,
      message: "Building icon updated successfully",
    });
  } catch (error) {
    console.error("Error updating building icon:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update building icon" },
      { status: 500 }
    );
  }
}
