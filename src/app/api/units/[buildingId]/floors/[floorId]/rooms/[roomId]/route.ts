import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import path from "path";
import fs from "fs";

// GET /api/units/[id]/floors/[floorId]/rooms/[roomId] - Oda detaylarını getir
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string; roomId: string }> }
) {
  try {
    // Session kontrolü
    const session = await getServerSession(authOptions);
    const { buildingId, floorId, roomId } = await params;
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

    if (!roomId) {
      return NextResponse.json(
        { success: false, message: "Room ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Odayı güncelle
    const building = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) });

    if (!building) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }

    const floor = building.floors.find((f: any) => f._id === floorId);
    const room = floor?.rooms.find((r: any) => r._id === roomId);

    return NextResponse.json({
      success: true,
      message: "Room retrieved successfully",
      room: room,
    });
  } catch (error) {
    console.error("Error retrieving room:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve room" },
      { status: 500 }
    );
  }
}

// PUT /api/units/[id]/floors/[floorId]/rooms/[roomId] - Oda güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string; roomId: string }> }
) {
  try {
    // Session kontrolü
    const session = await getServerSession(authOptions);
    const { buildingId } = await params;
    if (!session || session.user.role !== "admin" && session.user.permissions?.units === false && session.user.buildingPermissions?.[buildingId] === false) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Parametreleri al
    const { floorId, roomId } = await params;
    const { name } = await request.json();

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

    if (!roomId) {
      return NextResponse.json(
        { success: false, message: "Room ID is required" },
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

    // Odayı güncelle
    const result = await db.collection("buildings").updateOne(
      {
        _id: new ObjectId(buildingId),
        $and: [
          { $or: [{ "floors._id": floorId }, { "floors.id": floorId }] },
          { $or: [{ "floors.rooms._id": roomId }, { "floors.rooms.id": roomId }] }
        ]
      },
      {
        $set: {
          "floors.$[floor].rooms.$[room].name": name,
          "floors.$[floor].rooms.$[room].updatedAt": new Date()
        } as any
      },
      {
        arrayFilters: [
          { $or: [{ "floor._id": floorId }, { "floor.id": floorId }] },
          { $or: [{ "room._id": roomId }, { "room.id": roomId }] }
        ]
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building, floor or room not found" },
        { status: 404 }
      );
    }

    // Güncellenmiş oda bilgisini al
    const building = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) });

    if (!building) {
      return NextResponse.json(
        { success: false, message: "Building not found after update" },
        { status: 404 }
      );
    }

    const floor = building.floors.find((f: any) => f._id === floorId);
    const updatedRoom = floor?.rooms.find((r: any) => r._id === roomId || r.id === roomId);

    return NextResponse.json({
      success: true,
      message: "Room updated successfully",
      room: updatedRoom,
    });
  } catch (error) {
    console.error("Error updating room:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update room" },
      { status: 500 }
    );
  }
}

// DELETE /api/units/[id]/floors/[floorId]/rooms/[roomId] - Oda sil
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string; roomId: string }> }
) {
  try {
    // Session kontrolü
    const session = await getServerSession(authOptions);
    const { buildingId } = await params;
    if (!session || session.user.role !== "admin" && session.user.permissions?.units === false && session.user.buildingPermissions?.[buildingId] === false) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Parametreleri al
    const { floorId, roomId } = await params;
    console.log("buildingId, floorId, roomId", buildingId, floorId, roomId)

    if (!ObjectId.isValid(buildingId)) {
      return NextResponse.json(
        { success: false, message: "Invalid building ID" },
        { status: 400 }
      );
    }

    if (!floorId || !roomId) {
      return NextResponse.json(
        { success: false, message: "Floor ID and Room ID are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();



    // Silinecek odanın ikon bilgisini al
    const building = await db.collection("buildings").findOne({ _id: new ObjectId(buildingId) }) as any;
    if (!building) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }
    const floor = building?.floors?.find((f: any) => f._id.toString() === floorId);
    if (!floor) {
      return NextResponse.json(
        { success: false, message: "Floor not found" },
        { status: 404 }
      );
    }
    console.log("floor", floor)
    const roomToDelete = floor?.rooms?.find((r: any) => r.id === roomId);
    if (!roomToDelete) {
      return NextResponse.json(
        { success: false, message: "Room not found" },
        { status: 404 }
      );
    }
    console.log("roomToDelete", roomToDelete)
    const trendLogs = await db.collection("trendLogs").find({}).toArray();

    if (roomToDelete.flowData) {
      const nodes = roomToDelete.flowData.nodes;
      for (const node of nodes) {
        if (node.type == "registerNode") {
          if (trendLogs.find((t => t.registerId == node.id))) {
            return NextResponse.json(
              { success: false, message: "Building has trend logs" },
              { status: 400 }
            );
          }
          if (node.data.dataType == "boolean") {
            if (node.data.onIcon) {
              const iconPath = path.join(process.cwd(), "public", "uploads", node.data.onIcon);
              if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
              }
            }
            if (node.data.offIcon) {
              const iconPath = path.join(process.cwd(), "public", "uploads", node.data.offIcon);
              if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
              }
            }
          }
        }
      }
    }
    // Eğer odanın ikonu varsa, dosyayı sil
    if (roomToDelete?.icon) {
      const iconPath = path.join(process.cwd(), "public", "uploads", roomToDelete.icon);
      if (fs.existsSync(iconPath)) {
        fs.unlinkSync(iconPath);
      }
    }
    if (roomToDelete?.flowData) {
      const nodes = roomToDelete.flowData.nodes;
      for (const node of nodes) {
        console.log("node", node)
        if (node.data.image) {
          const imagePath = path.join(process.cwd(), "public", "uploads", node.data.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
        if (node.data.backgroundImage) {
          const backgroundImagePath = path.join(process.cwd(), "public", "uploads", node.data.backgroundImage);
          if (fs.existsSync(backgroundImagePath)) {
            fs.unlinkSync(backgroundImagePath);
          }
        }
        if (node.type == "registerNode") {
          // await db.collection("registers").insertOne({ nodeId: node.id, deleted: true }); // Soft delete mekanizması kaldırıldı.
        }
      }
    }
    await db.collection("buildings").updateOne(
      { _id: new ObjectId(buildingId), "floors._id": floorId },
      { $pull: { "floors.$.rooms": { _id: roomId } } as any }
    );

    return NextResponse.json({
      success: true,
      message: "Room deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting room:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete room" },
      { status: 500 }
    );
  }
}
