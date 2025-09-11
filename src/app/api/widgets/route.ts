import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const widgets = await db.collection("widgets").find({}).sort({ createdAt: 1 }).toArray();
    return NextResponse.json(widgets);
  } catch (error) {
    console.error("Error fetching widgets:", error);
    return NextResponse.json({ message: "Error fetching widgets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await connectToDatabase();
    const widget = await request.json();
    const newWidget = {
        ...widget,
        createdAt: new Date(),
    }
    await db.collection("widgets").insertOne(newWidget);
    return NextResponse.json(newWidget, { status: 201 });
  } catch (error) {
    console.error("Error creating widget:", error);
    return NextResponse.json({ message: "Error creating widget" }, { status: 500 });
  }
}