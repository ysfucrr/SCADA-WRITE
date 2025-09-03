import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import fs from "fs";
import path from "path";
// PUT /api/units/[id]/floors/[floorId]/rooms/[roomId]/icon - Oda ikonu güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string; roomId: string }> }
) {
  try {
    // Session kontrolü
    const session = await getServerSession(authOptions);
    const { buildingId } = await params;
    if (!session || session.user.role !== 'admin' && session.user.permissions?.units === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    
    // Parametreleri al
    const { floorId, roomId } = await params;
    const { iconPath } = await request.json();

    if (!ObjectId.isValid(buildingId)) {
      return NextResponse.json(
        { success: false, message: "Invalid building ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const building = await db.collection("buildings").findOne({ _id: new ObjectId(buildingId) });
    const floor = building?.floors?.find((floor: any) => floor._id === floorId);
    const room = floor?.rooms?.find((room: any) => room._id === roomId);
    
    if (room?.icon) {
      try {
        const filePath = path.join(process.cwd(), "public", room.icon);
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath);
          console.log(`Eski ikon dosyası silindi: ${filePath}`);
        }
      } catch (error) {
        console.error(`Dosya silinirken hata oluştu:`, error);
        // Dosya silinirken hata oluşsa bile işleme devam ediyoruz
      }
    }
    // MongoDB'de nested array içindeki belirli bir elemanı güncellemek için pozisyon operatörlerini kullanıyoruz
    const result = await db.collection("buildings").updateOne(
      { 
        _id: new ObjectId(buildingId),
        "floors._id": floorId,
        "floors.rooms._id": roomId
      },
      { 
        $set: { 
          "floors.$[floor].rooms.$[room].icon": iconPath,
          updatedAt: new Date() 
        } 
      },
      {
        arrayFilters: [
          { "floor._id": floorId },
          { "room._id": roomId }
        ]
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building, floor or room not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Room icon updated successfully",
    });
  } catch (error) {
    console.error("Error updating room icon:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update room icon" },
      { status: 500 }
    );
  }
}
