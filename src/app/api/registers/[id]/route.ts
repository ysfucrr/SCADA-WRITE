import { authOptions } from "@/lib/auth-options";
import { connectToDatabase } from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 403 }
      );
    }

    const { id } = await params; // This is the nodeId from the URL
    const updates = await request.json(); // These are the form fields

    const { db } = await connectToDatabase();

    const updateCommand: Record<string, any> = {};
    for (const key in updates) {
      updateCommand[`flowData.nodes.$[node].data.${key}`] = updates[key];
    }

    const result = await db.collection("buildings").updateOne(
      { "flowData.nodes.id": id },
      { $set: updateCommand },
      { arrayFilters: [{ "node.id": id }] }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Register node not found in any building" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, ...result });

  } catch (error) {
    console.error(`Failed to update register node: ${(await params).id}`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 403 }
      );
    }

    const { id } = await params; // This is the nodeId to be deleted
    const { db } = await connectToDatabase();

    const containingDoc = await db
      .collection("buildings")
      .findOne({ "flowData.nodes.id": id });

    if (containingDoc?.flowData?.nodes) {
      const nodeToDelete = containingDoc.flowData.nodes.find(
        (n: any) => n.id === id
      );

      if (nodeToDelete?.data) {
        const { onIcon, offIcon } = nodeToDelete.data;
        const deletePromises = [];
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
        
        const cleanPath = (fullPath: string) => {
          if (!fullPath) return '';
          return fullPath.replace('/api/uploads/', '').replace('/uploads/', '');
        };

        if (onIcon) {
          deletePromises.push(
            fetch(`${baseUrl}/api/deleteImage/${cleanPath(onIcon)}`, { method: "DELETE" })
          );
        }
        if (offIcon) {
          deletePromises.push(
            fetch(`${baseUrl}/api/deleteImage/${cleanPath(offIcon)}`, { method: "DELETE" })
          );
        }
        await Promise.all(deletePromises);
      }
    }

    const result = await db
      .collection("buildings")
      .updateOne(
        { "flowData.nodes.id": id },
        { $pull: { "flowData.nodes": { id: id } } } as any
      );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Register node not found to delete" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Register deleted successfully" });
  } catch (error) {
    console.error(`Failed to delete register node: ${(await params).id}`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}