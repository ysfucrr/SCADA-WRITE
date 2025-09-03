import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { backendLogger } from '@/lib/logger/BackendLogger';

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    // Step 1: Get all register IDs that are already used in trend logs
    const existingTrendLogs = await db.collection('trendLogs').find({}, { projection: { registerId: 1 } }).toArray();
    const loggedRegisterIds = existingTrendLogs.map(log => log.registerId);

    // Step 2: Build a pipeline to get all registers from buildings, similar to ModbusPoller's logic
     const pipeline = [
        // Deconstruct the nested arrays
        { $unwind: "$flowData.nodes" },
        { $match: { "flowData.nodes.type": "registerNode" } },

        // Filter out registers that are already in trend logs
        { $match: { "flowData.nodes.id": { $nin: loggedRegisterIds } } },

        // Group by analyzer and address to get unique registers
        {
            $group: {
                _id: {
                    analyzerId: "$flowData.nodes.data.analyzerId",
                    address: "$flowData.nodes.data.address"
                },
                // Keep the first document found for each unique register
                doc: { $first: "$$ROOT.flowData.nodes" }
            }
        },

        // Project the desired fields for the dropdown
        {
            $project: {
                _id: "$doc.id", // Use the original register node ID
                id: "$doc.id",
                name: { $ifNull: ["$doc.data.name", "$doc.data.label", "Unnamed Register"] },
                address: "$doc.data.address",
                analyzerId: "$doc.data.analyzerId",
                dataType: "$doc.data.dataType",
                byteOrder: "$doc.data.byteOrder",
                scale: "$doc.data.scale"
            }
        },
        
        // Sort for consistent ordering in the UI
        { $sort: { analyzerId: 1, address: 1 } }
    ];

    const registers = await db.collection('buildings').aggregate(pipeline).toArray();
    
    return NextResponse.json(registers);

  } catch (error) {
    backendLogger.error('Failed to fetch registers from DB', 'API/registers', { error });
    return NextResponse.json({ error: 'Failed to fetch registers from database' }, { status: 500 });
  }
}