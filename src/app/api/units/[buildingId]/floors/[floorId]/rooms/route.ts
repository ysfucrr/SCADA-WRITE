import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// GET /api/units/[buildingId]/floors/[floorId]/rooms - Odaları listele
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string }> }
) {
  try {
    // Session kontrolü
    const { buildingId, floorId } = await params;
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.units === false && session.user.buildingPermissions?.[buildingId] === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Parametreleri al

    if (!ObjectId.isValid(buildingId)) {
      return NextResponse.json(
        { success: false, message: "Invalid building ID" },
        { status: 400 }
      );
    }

    if (!floorId) {
      return NextResponse.json(
        { success: false, message: "Floor ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const building = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) });

    if (!building) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }

    const floor = building.floors.find((f: any) => f._id === floorId || f.id === floorId);

    if (!floor) {
      return NextResponse.json(
        { success: false, message: "Floor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      rooms: floor.rooms || [],
    });
  } catch (error) {
    console.error("Error fetching rooms:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch rooms" },
      { status: 500 }
    );
  }
}

// POST /api/units/[buildingId]/floors/[floorId]/rooms - Oda ekle
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string }> }
) {
  try {
    // Session kontrolü
    const { buildingId, floorId } = await params;
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.units === false && session.user.buildingPermissions?.[buildingId] === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    
    const body = await request.json()
    console.log("body", body)
    if (body.flowData) {
      const { _id, flowData } = body;

      console.log("_id", _id)
      console.log("buildingId", buildingId)
      console.log("floorId", floorId)
      if (!_id || !flowData) {
        return NextResponse.json(
          { success: false, message: "Missing required fields" },
          { status: 400 }
        );
      }

      try {
        const { db } = await connectToDatabase();
        const buildingRecord = await db.collection('buildings').findOne({ _id: new ObjectId(buildingId) });
        if (!buildingRecord) {
          return NextResponse.json(
            { success: false, message: "Building not found" },
            { status: 404 }
          );
        }
        const floorData = buildingRecord.floors.find((floor: any) => floor.id === floorId);
        if (!floorData) {
          return NextResponse.json(
            { success: false, message: "Floor not found" },
            { status: 404 }
          );
        }
        const roomData = floorData.rooms.find((room: any) => room.id === _id);
        console.log("roomData", roomData)
        if (!roomData) {
          return NextResponse.json(
            { success: false, message: "Room not found" },
            { status: 404 }
          );
        }
        roomData.flowData = flowData;

        const result = await db.collection('buildings').updateOne(
          { _id: new ObjectId(buildingId) },
          { $set: { floors: buildingRecord.floors } },
          { upsert: false }
        );

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
    // Parametreleri al
    const { name } = body

    if (!ObjectId.isValid(buildingId)) {
      return NextResponse.json(
        { success: false, message: "Invalid building ID" },
        { status: 400 }
      );
    }

    if (!floorId) {
      return NextResponse.json(
        { success: false, message: "Floor ID is required" },
        { status: 400 }
      );
    }

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Room name is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    
    // Binanın ve katın var olduğunu kontrol et
    const building = await db
      .collection("buildings")
      .findOne({ 
        _id: new ObjectId(buildingId), 
        $or: [{"floors._id": floorId}, {"floors.id": floorId}] 
      });

    if (!building) {
      return NextResponse.json(
        { success: false, message: "Building or floor not found" },
        { status: 404 }
      );
    }

    const roomId = uuidv4();
    const newRoom = {
      _id: roomId,
      id: roomId, // Tutarlılık için aynı ID kullanıyoruz
      name,
      createdAt: new Date(),
    };

    // Önce doğru katı bulalım - hem _id hem de id kontrolü yapalım
    // Ancak mongodb positional operator için sadece tek bir koşul kullanıp hedef array elemanını kesin belirlememiz gerekiyor
    const targetBuilding = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) });
      
    if (!targetBuilding) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );  
    }
    
    // Hedef katı bulalım
    const targetFloorIndex = targetBuilding.floors.findIndex(
      (f: any) => f._id === floorId || f.id === floorId
    );
    
    if (targetFloorIndex === -1) {
      return NextResponse.json(
        { success: false, message: "Floor not found" },
        { status: 404 }
      );
    }
    
    // Şimdi doğrudan index kullanarak odayı ekleyebiliriz
    const result = await db.collection("buildings").updateOne(
      { _id: new ObjectId(buildingId) },
      { $push: { [`floors.${targetFloorIndex}.rooms`]: newRoom } as any }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building or floor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Room added successfully",
      room: newRoom,
    });
  } catch (error) {
    console.error("Error adding room:", error);
    return NextResponse.json(
      { success: false, message: "Failed to add room" },
      { status: 500 }
    );
  }
}
