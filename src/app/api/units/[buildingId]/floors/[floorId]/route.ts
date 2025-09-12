import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import path from "path";
import fs from "fs";

// GET /api/units/[id]/floors/[floorId] - Kat getir
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
      .findOne({ _id: new ObjectId(buildingId) }) as any;

    const floor = building.floors.find((f: any) => f._id === floorId || f.id === floorId);

    if (!floor) {
      return NextResponse.json(
        { success: false, message: "Floor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Floor retrieved successfully",
      floor: floor,
    });
  } catch (error) {
    console.error("Error retrieving floor:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve floor" },
      { status: 500 }
    );
  }
}

// PUT /api/units/[id]/floors/[floorId] - Kat güncelle
export async function PUT(
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

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Floor name is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();


    // Değişikliği yapın
    const result = await db.collection("buildings").updateOne(
      {
        _id: new ObjectId(buildingId),
        "floors._id": floorId
      },
      {
        $set: {
          "floors.$.name": name,
          "floors.$.updatedAt": new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building or floor not found" },
        { status: 404 }
      );
    }

    // Güncellenmiş kat bilgisini al
    const building = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) }) as any;

    const updatedFloor = building.floors.find((f: any) => f._id === floorId);

    return NextResponse.json({
      success: true,
      message: "Floor updated successfully",
      floor: updatedFloor,
    });
  } catch (error) {
    console.error("Error updating floor:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update floor" },
      { status: 500 }
    );
  }
}

// DELETE /api/units/[id]/floors/[floorId] - Kat sil
export async function DELETE(
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
    console.log("buildingId, floorId", buildingId, floorId)

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




    //delete icon if exist
    const building = await db.collection("buildings").findOne({ _id: new ObjectId(buildingId) }) as any;
    if (!building) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }

    if (!building.floors.find((f: any) => f._id.toString() === floorId)) {
      return NextResponse.json(
        { success: false, message: "Floor not found" },
        { status: 404 }
      );
    }
    const floorToDelete = building?.floors?.find((f: any) => f._id.toString() === floorId);
    const trendLogs = await db.collection("trendLogs").find({}).toArray();

    if (floorToDelete?.flowData) {
      const nodes = floorToDelete.flowData.nodes;
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
    const rooms = floorToDelete.rooms;
    for (const room of rooms) {
      if (room.flowData) {
        const nodes = room.flowData.nodes;
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
    }

    // Kat ikonunu sil
    if (floorToDelete?.icon) {
      try {
        const iconFilename = floorToDelete.icon.split('/').pop();
        if (iconFilename) {
          const iconPath = path.join(process.cwd(), 'public', 'uploads', iconFilename);
          if (fs.existsSync(iconPath)) {
            await fs.promises.unlink(iconPath);
            console.log('Floor icon deleted:', iconFilename);
          }
        }
      } catch (error) {
        console.error('Error deleting floor icon:', error);
      }
    }
    //delete all images and backgroundImages from flowData nodes if exist
    if (floorToDelete?.flowData) {
      const nodes = floorToDelete.flowData.nodes;
      for (const node of nodes) {
        if (node.data.image) {
          const imagePath = path.join(process.cwd(), "public", "uploads", node.data.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
        if (node.data.backgroundImage) {
          const imagePath = path.join(process.cwd(), "public", "uploads", node.data.backgroundImage);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
        if (node.type == "registerNode") {
          // await db.collection("registers").insertOne({ nodeId: node.id, deleted: true });
        }
      }
    }
    //delete all rooms if exist
    if (floorToDelete?.rooms) {
      const rooms = floorToDelete.rooms;
      for (const room of rooms) {
        // Oda ikonunu sil
        if (room.icon) {
          try {
            const iconFilename = room.icon.split('/').pop();
            if (iconFilename) {
              const iconPath = path.join(process.cwd(), 'public', 'uploads', iconFilename);
              if (fs.existsSync(iconPath)) {
                await fs.promises.unlink(iconPath);
                console.log('Room icon deleted:', iconFilename);
              }
            }
          } catch (error) {
            console.error('Error deleting room icon:', error);
          }
        }
        //delete all images and backgroundImages from flowData nodes if exist
        if (room.flowData) {
          const nodes = room.flowData.nodes;
          for (const node of nodes) {
            if (node.data.image) {
              const imagePath = path.join(process.cwd(), "public", "uploads", node.data.image);
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
              }
            }
            if (node.data.backgroundImage) {
              const imagePath = path.join(process.cwd(), "public", "uploads", node.data.backgroundImage);
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
              }
            }
            if (node.type == "registerNode") {
              // await db.collection("registers").insertOne({ nodeId: node.id, deleted: true });
            }
          }
        }
      }
    }
    await db.collection("buildings").updateOne(
      { _id: new ObjectId(buildingId) },
      {
        $pull: {
          floors: {
            $or: [{ _id: floorId }, { id: floorId }]
          }
        } as any
      }
    );
    return NextResponse.json({
      success: true,
      message: "Floor deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting floor:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete floor" },
      { status: 500 }
    );
  }
}
