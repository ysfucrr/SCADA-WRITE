import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const widget = await request.json();
    
    // remove the _id from the widget object before updating
    delete widget._id;
    
    await db.collection("widgets").updateOne({ _id: new ObjectId(id) }, { $set: widget });
    return NextResponse.json({ message: "Widget updated successfully" });
  } catch (error) {
    console.error("Error updating widget:", error);
    return NextResponse.json({ message: "Error updating widget" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    await db.collection("widgets").deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ message: "Widget deleted successfully" });
  } catch (error) {
    console.error("Error deleting widget:", error);
    return NextResponse.json({ message: "Error deleting widget" }, { status: 500 });
  }
}