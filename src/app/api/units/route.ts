import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// GET /api/units - Binaları listele
export async function GET() {
  try {
    // Session kontrolü
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const buildings = await db.collection("buildings").find({}).toArray();

    return NextResponse.json({
      success: true,
      buildings: buildings.map((building: any) => ({
        _id: building._id.toString(),
        name: building.name,
        icon: building.icon, // İkon bilgisini ekle
        flowData: building.flowData,
        floors: (building.floors || []).map((floor: any) => ({
          _id: floor._id.toString(),
          name: floor.name,
          icon: floor.icon, // Kat ikon bilgisini ekle
          flowData: floor.flowData,
          rooms: (floor.rooms || []).map((room: any) => ({
            _id: room._id.toString(),
            name: room.name,
            icon: room.icon, // Oda ikon bilgisini ekle
            flowData: room.flowData,
          }))
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching buildings:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch buildings" },
      { status: 500 }
    );
  }
}

// POST /api/units - Yeni bina ekle veya flow verilerini güncelle
export async function POST(request: NextRequest) {
  try {
    // Session kontrolü
    
    const body = await request.json();
    const { _id, flowData } = body;
    
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.units === false && session.user.buildingPermissions?.[_id] === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    // Flow data güncelleme isteği
    if (body.flowData) {
      
      if (!_id || !flowData) {
        return NextResponse.json(
          { success: false, message: "Missing required fields" },
          { status: 400 }
        );
      }

      try {
        const { db } = await connectToDatabase();
        const result = await db.collection('buildings').updateOne(
          { _id: new ObjectId(_id) },
          { $set: { flowData } },
          { upsert: false }
        );

        if (result.matchedCount === 0) {
          return NextResponse.json(
            { success: false, message: "Building not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          updated: result.modifiedCount
        }, { status: 200 });
      } catch (error: unknown) {
        console.error("Error saving flow data:", error);
        return NextResponse.json(
          { success: false, message: "Database error" },
          { status: 500 }
        );
      }
    } 
    // Yeni bina ekleme isteği
    else if (body.name) {
      const { name } = body;

      if (!name || name.trim() === "") {
        return NextResponse.json(
          { success: false, message: "Building name is required" },
          { status: 400 }
        );
      }

      const { db } = await connectToDatabase();

      const newBuilding = {
        name,
        floors: [],
        createdAt: new Date(),
      };

      const result = await db.collection("buildings").insertOne(newBuilding);

      return NextResponse.json({
        success: true,
        message: "Building created successfully",
        building: {
          _id: result.insertedId.toString(),
          name,
          floors: [],
        },
      });
    }
    // Geçersiz istek
    else {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Server error";
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}
