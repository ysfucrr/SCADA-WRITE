import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: registerId } = await params;

  if (!registerId) {
    return NextResponse.json({ error: 'Register ID is required' }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    let register = null;

    // 1. Bina seviyesinde register'ı ara
    const buildingResult = await db.collection('buildings').aggregate([
      { $match: { "flowData.nodes.id": registerId } },
      { $unwind: "$flowData.nodes" },
      { $match: { "flowData.nodes.id": registerId } },
      { $project: { register: "$flowData.nodes" } }
    ]).toArray();

    if (buildingResult.length > 0) {
      register = buildingResult[0].register;
    }

    // 2. Kat seviyesinde register'ı ara
    if (!register) {
      const floorResult = await db.collection('buildings').aggregate([
        { $match: { "floors.flowData.nodes.id": registerId } },
        { $unwind: "$floors" },
        { $unwind: "$floors.flowData.nodes" },
        { $match: { "floors.flowData.nodes.id": registerId } },
        { $project: { register: "$floors.flowData.nodes" } }
      ]).toArray();

      if (floorResult.length > 0) {
        register = floorResult[0].register;
      }
    }

    // 3. Oda seviyesinde register'ı ara
    if (!register) {
      const roomResult = await db.collection('buildings').aggregate([
        { $match: { "floors.rooms.flowData.nodes.id": registerId } },
        { $unwind: "$floors" },
        { $unwind: "$floors.rooms" },
        { $unwind: "$floors.rooms.flowData.nodes" },
        { $match: { "floors.rooms.flowData.nodes.id": registerId } },
        { $project: { register: "$floors.rooms.flowData.nodes" } }
      ]).toArray();

      if (roomResult.length > 0) {
        register = roomResult[0].register;
      }
    }

    if (!register) {
      backendLogger.warning(`Register with ID ${registerId} not found.`, 'API/registers/[id]/GET');
      return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    }

    backendLogger.info(`Successfully retrieved register ${registerId}.`, 'API/registers/[id]/GET');
    return NextResponse.json(register);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Failed to retrieve register ${registerId}`, 'API/registers/[id]/GET', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to retrieve register from database' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: registerId } = await params;
  
  if (!registerId) {
    return NextResponse.json({ error: 'Register ID is required' }, { status: 400 });
  }

  try {
    const updatedData = await request.json();
    const { db } = await connectToDatabase();

    let totalModified = 0;

    // 1. Bina seviyesinde güncellemeyi dene
    const buildingResult = await db.collection('buildings').updateOne(
      { "flowData.nodes.id": registerId },
      { $set: { "flowData.nodes.$[elem].data": updatedData } },
      { arrayFilters: [{ "elem.id": registerId }] }
    );
    totalModified += buildingResult.modifiedCount;

    // 2. Kat seviyesinde güncellemeyi dene
    if (totalModified === 0) {
      const floorResult = await db.collection('buildings').updateOne(
        { "floors.flowData.nodes.id": registerId },
        { $set: { "floors.$[].flowData.nodes.$[elem].data": updatedData } },
        { arrayFilters: [{ "elem.id": registerId }] }
      );
      totalModified += floorResult.modifiedCount;
    }

    // 3. Oda seviyesinde güncellemeyi dene
    if (totalModified === 0) {
      const roomResult = await db.collection('buildings').updateOne(
        { "floors.rooms.flowData.nodes.id": registerId },
        { $set: { "floors.$[].rooms.$[].flowData.nodes.$[elem].data": updatedData } },
        { arrayFilters: [{ "elem.id": registerId }] }
      );
      totalModified += roomResult.modifiedCount;
    }

    if (totalModified === 0) {
      backendLogger.warning(`Register with ID ${registerId} not found in any flowData to update.`, 'API/registers/[id]/PUT');
      return NextResponse.json({ error: 'Register not found to update' }, { status: 404 });
    }

    backendLogger.info(`Successfully updated register ${registerId}.`, 'API/registers/[id]/PUT');
    return NextResponse.json({ success: true, message: `Register ${registerId} updated.` });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Failed to update register ${registerId}`, 'API/registers/[id]/PUT', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to update register in database' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: registerId } = await params;

  if (!registerId) {
    return NextResponse.json({ error: 'Register ID is required' }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    // 1. Bina seviyesindeki register'ları sil
    const resultBuilding = await db.collection('buildings').updateMany(
      { "flowData.nodes.id": registerId },
      { $pull: { "flowData.nodes": { id: registerId } } as any }
    );

    // 2. Kat seviyesindeki register'ları sil
    const resultFloors = await db.collection('buildings').updateMany(
      { "floors.flowData.nodes.id": registerId },
      { $pull: { "floors.$[].flowData.nodes": { id: registerId } } as any }
    );

    // 3. Oda seviyesindeki register'ları sil
    const resultRooms = await db.collection('buildings').updateMany(
        { "floors.rooms.flowData.nodes.id": registerId },
        { $pull: { "floors.$[].rooms.$[].flowData.nodes": { id: registerId } } as any }
    );
     
    // 4. Widget'lardaki ilgili register'ı sil
    const resultWidgets = await db.collection('widgets').updateMany(
      { "registers.id": registerId },
      { $pull: { "registers": { id: registerId } } as any }
    );

    const totalModified = resultBuilding.modifiedCount + resultFloors.modifiedCount + resultRooms.modifiedCount;
    const widgetsModified = resultWidgets.modifiedCount;

    if (totalModified === 0) {
      backendLogger.warning(`Register ID ${registerId} not found to delete.`, 'API/registers/[id]/DELETE');
    } else {
      backendLogger.info(`Successfully deleted register ${registerId} from ${totalModified} location(s).`, 'API/registers/[id]/DELETE');
    }

    if (widgetsModified > 0) {
      backendLogger.info(`Successfully removed register ${registerId} from ${widgetsModified} widgets.`, 'API/registers/[id]/DELETE');
    }

    return NextResponse.json({
      success: true,
      message: `Register ${registerId} deleted successfully.`,
      widgetsUpdated: widgetsModified > 0
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Failed to delete register ${registerId}`, 'API/registers/[id]/DELETE', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to delete register from database' }, { status: 500 });
  }
}