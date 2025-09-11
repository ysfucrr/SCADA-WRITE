import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const buildings = await db.collection("buildings").find({}).toArray();
    const analyzers = await db.collection("analyzers").find({}).toArray();
    const analyzerMap = new Map(analyzers.map(a => [a._id.toString(), a.name]));

    const registers: any[] = [];

    const findRegistersInFlowData = (flowData: any, buildingName: string, floorName?: string, roomName?: string) => {
      if (!flowData || !flowData.nodes) return;
      
      flowData.nodes.forEach((node: any) => {
        if (node.type === 'registerNode' && node.data.analyzerId) {
          registers.push({
            id: node.id,
            label: node.data.label,
            analyzerId: node.data.analyzerId,
            analyzerName: analyzerMap.get(node.data.analyzerId),
            address: node.data.address,
            dataType: node.data.dataType,
            bit: node.data.bit,
            location: `${buildingName}${floorName ? ` / ${floorName}` : ''}${roomName ? ` / ${roomName}` : ''}`
          });
        }
      });
    };

    buildings.forEach((building) => {
      findRegistersInFlowData(building.flowData, building.name);
      if (building.floors) {
        building.floors.forEach((floor: any) => {
          findRegistersInFlowData(floor.flowData, building.name, floor.name);
          if (floor.rooms) {
            floor.rooms.forEach((room: any) => {
              findRegistersInFlowData(room.flowData, building.name, floor.name, room.name);
            });
          }
        });
      }
    });

    return NextResponse.json(registers);
  } catch (error) {
    console.error("Error fetching registers:", error);
    return NextResponse.json({ message: "Error fetching registers" }, { status: 500 });
  }
}