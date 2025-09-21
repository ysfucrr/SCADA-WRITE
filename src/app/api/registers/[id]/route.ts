import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { ObjectId } from 'mongodb';


export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    // Not: Bu sorgu karmaşıklığı nedeniyle beklendiği gibi çalışmazsa basitleştirilmesi gerekebilir.
    const resultRooms = await db.collection('buildings').updateMany(
        { "floors.rooms.flowData.nodes.id": registerId },
        { $pull: { "floors.$[].rooms.$[].flowData.nodes": { id: registerId } } as any }
    );
     
    const totalModified = resultBuilding.modifiedCount + resultFloors.modifiedCount + resultRooms.modifiedCount;

    if (totalModified === 0) {
      backendLogger.warning(`Register with ID ${registerId} not found in any flowData to delete.`, 'API/registers/[id]/DELETE');
    } else {
      backendLogger.info(`Successfully deleted register ${registerId} from ${totalModified} location(s).`, 'API/registers/[id]/DELETE');
    }

    return NextResponse.json({
      success: true,
      message: `Register ${registerId} deleted successfully.`
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Failed to delete register ${registerId}`, 'API/registers/[id]/DELETE', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to delete register from database' }, { status: 500 });
  }
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'Register ID is required' }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const {
      label,
      address,
      dataType,
      scale,
      scaleUnit,
      byteOrder,
      textColor,
      backgroundColor,
      opacity,
      analyzerId,
      bit,
      displayMode,
      registerType,
      offsetValue,
      controlType,
      dropdownOptions,
      writeFunctionCode,
      onValue,
      offValue,
      onIcon,
      offIcon,
      decimalPlaces,
    } = body;

    const updateData = {
      $set: {
        "flowData.nodes.$[node].data.label": label,
        "flowData.nodes.$[node].data.address": address,
        "flowData.nodes.$[node].data.dataType": dataType,
        "flowData.nodes.$[node].data.scale": scale,
        "flowData.nodes.$[node].data.scaleUnit": scaleUnit,
        "flowData.nodes.$[node].data.byteOrder": byteOrder,
        "flowData.nodes.$[node].data.textColor": textColor,
        "flowData.nodes.$[node].data.backgroundColor": backgroundColor,
        "flowData.nodes.$[node].data.opacity": opacity,
        "flowData.nodes.$[node].data.analyzerId": analyzerId,
        "flowData.nodes.$[node].data.bit": bit,
        "flowData.nodes.$[node].data.displayMode": displayMode,
        "flowData.nodes.$[node].data.registerType": registerType,
        "flowData.nodes.$[node].data.offsetValue": offsetValue,
        "flowData.nodes.$[node].data.controlType": controlType,
        "flowData.nodes.$[node].data.dropdownOptions": dropdownOptions,
        "flowData.nodes.$[node].data.writeFunctionCode": writeFunctionCode,
        "flowData.nodes.$[node].data.onValue": onValue,
        "flowData.nodes.$[node].data.offValue": offValue,
        "flowData.nodes.$[node].data.onIcon": onIcon,
        "flowData.nodes.$[node].data.offIcon": offIcon,
        "flowData.nodes.$[node].data.decimalPlaces": decimalPlaces,
      }
    };

    const arrayFilters = [{ "node.id": id }];

    // Update in buildings
    await db.collection('buildings').updateMany(
      { "flowData.nodes.id": id },
      updateData,
      { arrayFilters }
    );

    // Update in floors
    await db.collection('buildings').updateMany(
      { "floors.flowData.nodes.id": id },
      { $set: { "floors.$[].flowData.nodes.$[node].data": body } },
      { arrayFilters: [{ "node.id": id }] }
    );

    // Update in rooms
    await db.collection('buildings').updateMany(
      { "floors.rooms.flowData.nodes.id": id },
      { $set: { "floors.$[].rooms.$[].flowData.nodes.$[node].data": body } },
      { arrayFilters: [{ "node.id": id }] }
    );

    backendLogger.info(`Register ${id} updated successfully`, 'API/registers/[id]/PUT');

    return NextResponse.json({ success: true, message: `Register ${id} updated successfully.` });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Failed to update register ${id}`, 'API/registers/[id]/PUT', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to update register in database' }, { status: 500 });
  }
}