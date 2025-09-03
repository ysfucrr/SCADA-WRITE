import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// GET /api/units/[buildingId]/floors - Katları listele
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    // Session kontrolü
    const { buildingId } = await params;
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

    return NextResponse.json({
      success: true,
      floors: building.floors || [],
    });
  } catch (error) {
    console.error("Error fetching floors:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch floors" },
      { status: 500 }
    );
  }
}

// POST /api/units/[buildingId]/floors - Kat ekle
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    // Session kontrolü
    const { buildingId } = await params;
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.units === false && session.user.buildingPermissions?.[buildingId] === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const body = await request.json();
    // Flow data güncelleme isteği
    if (body.flowData) {
      const { _id, flowData } = body;
      const { buildingId } = await params;

      console.log("_id", _id)
      console.log("buildingId", buildingId)
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
        const floorData = buildingRecord.floors.find((floor: any) => floor.id === _id);
        if (!floorData) {
          return NextResponse.json(
            { success: false, message: "Floor not found" },
            { status: 404 }
          );
        }
        floorData.flowData = flowData;

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
    // Yeni bina ekleme isteği
    else if (body.name) {


      // Parametreleri al
      const { name } = body;
      const { buildingId } = await params;

      if (!ObjectId.isValid(buildingId)) {
        return NextResponse.json(
          { success: false, message: "Invalid building ID" },
          { status: 400 }
        );
      }

      if (!name || name.trim() === "") {
        return NextResponse.json(
          { success: false, message: "Floor name is required" },
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

      const floorId = uuidv4();
      const newFloor = {
        _id: floorId,
        id: floorId,  // Tutarlılık için aynı ID'yi kullanıyoruz
        name,
        rooms: [],
        createdAt: new Date(),
      };

      await db.collection("buildings").updateOne(
        { _id: new ObjectId(buildingId) },
        { $push: { floors: newFloor } as any }
      );

      return NextResponse.json({
        success: true,
        message: "Floor added successfully",
        floor: newFloor,
      });
    }
  } catch (error) {
    console.error("Error adding floor:", error);
    return NextResponse.json(
      { success: false, message: "Failed to add floor" },
      { status: 500 }
    );
  }
}
