import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db("scada_dashboard");
    const consumptionWidgets = await db.collection("consumption").find({}).toArray();

    return NextResponse.json(consumptionWidgets);
  } catch (error) {
    console.error("Error fetching consumption widgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch consumption widgets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, size, appearance, type, trendLogId, timeFilter } = body;

    if (!title || !size || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("scada_dashboard");

    // Get existing widgets to calculate position
    const existingWidgets = await db.collection("consumption").find({}).toArray();
    
    // Calculate position for new widget
    let position = { x: 260, y: 220 }; // Default position for first widget
    
    if (existingWidgets.length > 0) {
      // Find the best position that doesn't overlap
      const widgetWidth = size.width || 600;
      const widgetHeight = size.height || 400;
      const margin = 20; // Space between widgets
      
      // Try to place widgets in a grid pattern
      let placed = false;
      let row = 0;
      
      while (!placed) {
        for (let col = 0; col < 2; col++) { // 2 columns max
          const testX = 260 + (col * (widgetWidth + margin));
          const testY = 220 + (row * (widgetHeight + margin));
          
          // Check if this position overlaps with any existing widget
          const overlaps = existingWidgets.some(widget => {
            const wx = widget.position?.x || 0;
            const wy = widget.position?.y || 0;
            const ww = widget.size?.width || 600;
            const wh = widget.size?.height || 400;
            
            return !(testX >= wx + ww + margin ||
                    testX + widgetWidth + margin <= wx ||
                    testY >= wy + wh + margin ||
                    testY + widgetHeight + margin <= wy);
          });
          
          if (!overlaps) {
            position = { x: testX, y: testY };
            placed = true;
            break;
          }
        }
        
        if (!placed) {
          row++;
          // Safety check to prevent infinite loop
          if (row > 10) {
            // Fallback: place it at the bottom
            const maxY = Math.max(...existingWidgets.map(w => (w.position?.y || 0) + (w.size?.height || 400)));
            position = { x: 260, y: maxY + margin };
            placed = true;
          }
        }
      }
    }

    const newWidget = {
      title,
      size,
      appearance: appearance || {
        fontFamily: "Arial, sans-serif",
        textColor: "#000000",
        backgroundColor: "#ffffff",
        opacity: 100,
      },
      type,
      trendLogId: trendLogId ? new ObjectId(trendLogId) : null,
      timeFilter: timeFilter || "day",
      position,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("consumption").insertOne(newWidget);

    return NextResponse.json({
      ...newWidget,
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Error creating consumption widget:", error);
    return NextResponse.json(
      { error: "Failed to create consumption widget" },
      { status: 500 }
    );
  }
}