import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import path from "path";
import fs from "fs";
// GET /api/units/[id] - Bina detayları
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

    // Debug için log ekle
    console.log('Building data from DB:', building);

    return NextResponse.json({
      success: true,
      building: {
        _id: building._id.toString(),
        name: building.name,
        icon: building.icon,
        flowData: building.flowData,
        floors: building.floors || [],
      },
    });
  } catch (error) {
    console.error("Error fetching building:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch building" },
      { status: 500 }
    );
  }
}

// PUT /api/units/[id] - Bina güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;
    // Session kontrolü
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

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Building name is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const result = await db.collection("buildings").updateOne(
      { _id: new ObjectId(buildingId) },
      { $set: { name, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }

    const updatedBuilding = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) });

    if (!updatedBuilding) {
      return NextResponse.json(
        { success: false, message: "Building not found after update" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Building updated successfully",
      building: {
        _id: updatedBuilding._id.toString(),
        name: updatedBuilding.name,
        icon: updatedBuilding.icon,
        flowData: updatedBuilding.flowData,
        floors: updatedBuilding.floors || [],
      },
    });
  } catch (error) {
    console.error("Error updating building:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update building" },
      { status: 500 }
    );
  }
}

// DELETE /api/units/[id] - Bina sil
export async function DELETE(
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

    //binayı bul, bina iconunu, bağlı katların ikonlarını, bağlı odaların ikonlarını sil
    //bina flowData'sında, bağlı katların flowData'sında, bağlı odaların flowDatasında node.data içinde image veya backgroundImage özellikleri olanlarda image dosyalarını sil
    const building = await db
      .collection("buildings")
      .findOne({ _id: new ObjectId(buildingId) });


    const trendLogs = await db.collection("trendLogs").find({ }).toArray();
    if (building?.flowData) {
      const nodes = building.flowData.nodes;
      for (const node of nodes) {
        if (node.type == "registerNode"){
          if (trendLogs.find((t => t.registerId == node.id))){
            return NextResponse.json(
              { success: false, message: "Building has trend logs" },
              { status: 400 }
            );
          }

          if (node.data.dataType == "boolean"){
            if (node.data.onIcon){
              const iconPath = path.join(process.cwd(), "public", "uploads", node.data.onIcon);
              if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
              }
            }
            if (node.data.offIcon){
              const iconPath = path.join(process.cwd(), "public", "uploads", node.data.offIcon);
              if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
              }
            }
          }
        }
      }
    }
    if (building?.floors) {
      const floors = building.floors;
      for (const floor of floors) {
        if (floor.flowData) {
          const nodes = floor.flowData.nodes;
          for (const node of nodes) {
            if (node.type == "registerNode"){
              if (trendLogs.find((t => t.registerId == node.id))){
                return NextResponse.json(
                  { success: false, message: "Building has trend logs" },
                  { status: 400 }
                );
              }
              if (node.data.dataType == "boolean"){
                if (node.data.onIcon){
                  const iconPath = path.join(process.cwd(), "public", "uploads", node.data.onIcon);
                  if (fs.existsSync(iconPath)) {
                    fs.unlinkSync(iconPath);
                  }
                }
                if (node.data.offIcon){
                  const iconPath = path.join(process.cwd(), "public", "uploads", node.data.offIcon);
                  if (fs.existsSync(iconPath)) {
                    fs.unlinkSync(iconPath);
                  }
                }
              }
            }
          }
        }
        const rooms = floor.rooms;
        for (const room of rooms) {
          if (room.flowData) {
            const nodes = room.flowData.nodes;
            for (const node of nodes) {
              if (node.type == "registerNode"){
                if (trendLogs.find((t => t.registerId == node.id))){
                  return NextResponse.json(
                    { success: false, message: "Building has trend logs" },
                    { status: 400 }
                  );
                }
                if (node.data.dataType == "boolean"){
                  if (node.data.onIcon){
                    const iconPath = path.join(process.cwd(), "public", "uploads", node.data.onIcon);
                    if (fs.existsSync(iconPath)) {
                      fs.unlinkSync(iconPath);
                    }
                  }
                  if (node.data.offIcon){
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
      }
    }


    if (building?.icon) {
      const iconPath = path.join(process.cwd(), "public", "uploads", building.icon);
      if (fs.existsSync(iconPath)) {
        fs.unlinkSync(iconPath);
      }
    }
    if (building?.flowData) {
      const nodes = building.flowData.nodes;
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
          await db.collection("registers").insertOne({ nodeId: node.id, deleted: true });
        }
      }
    }


    const floors = building?.floors || [];
    for (const floor of floors) {
      if (floor.icon) {
        const iconPath = path.join(process.cwd(), "public", "uploads", floor.icon);
        if (fs.existsSync(iconPath)) {
          fs.unlinkSync(iconPath);
        }
      }
      if (floor.flowData) {
        const nodes = floor.flowData.nodes;
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
            await db.collection("registers").insertOne({ nodeId: node.id, deleted: true });
          }
        }
      }
      const rooms = floor.rooms || [];
      for (const room of rooms) {
        console.log("room", JSON.stringify(room))
        if (room.icon) {
          const iconPath = path.join(process.cwd(), "public", "uploads", room.icon);
          if (fs.existsSync(iconPath)) {
            fs.unlinkSync(iconPath);
          }
        }
        if (room.flowData) {
          console.log("room.flowData", JSON.stringify(room.flowData))
          const nodes = room.flowData.nodes;
          for (const node of nodes) {
            console.log("node", JSON.stringify(node))
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
              await db.collection("registers").insertOne({ nodeId: node.id, deleted: true });
            }
          }
        }
      }
    }




    const result = await db
      .collection("buildings")
      .deleteOne({ _id: new ObjectId(buildingId) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Building not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      message: "Building deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting building:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete building" },
      { status: 500 }
    );
  }
}
