import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid widget ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("scada_dashboard");
    const widget = await db.collection("consumption").findOne({ _id: new ObjectId(id) });

    if (!widget) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    return NextResponse.json(widget);
  } catch (error) {
    console.error("Error fetching consumption widget:", error);
    return NextResponse.json(
      { error: "Failed to fetch consumption widget" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid widget ID" }, { status: 400 });
    }

    const body = await request.json();
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Only update fields that are provided
    if (body.title !== undefined) updateData.title = body.title;
    if (body.size !== undefined) updateData.size = body.size;
    if (body.appearance !== undefined) updateData.appearance = body.appearance;
    if (body.position !== undefined) updateData.position = body.position;
    if (body.trendLogId !== undefined) {
      updateData.trendLogId = body.trendLogId ? new ObjectId(body.trendLogId) : null;
    }
    if (body.timeFilter !== undefined) updateData.timeFilter = body.timeFilter;

    const client = await clientPromise;
    const db = client.db("scada_dashboard");
    const result = await db.collection("consumption").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    const updatedWidget = await db.collection("consumption").findOne({ _id: new ObjectId(id) });

    return NextResponse.json(updatedWidget);
  } catch (error) {
    console.error("Error updating consumption widget:", error);
    return NextResponse.json(
      { error: "Failed to update consumption widget" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid widget ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("scada_dashboard");
    const result = await db.collection("consumption").deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Widget deleted successfully" });
  } catch (error) {
    console.error("Error deleting consumption widget:", error);
    return NextResponse.json(
      { error: "Failed to delete consumption widget" },
      { status: 500 }
    );
  }
}