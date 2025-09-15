import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { ObjectId } from 'mongodb';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  // Next.js uyumluluğu için 'params' beklenir.
  const awaitedParams = await Promise.resolve(params);
  const registerId = awaitedParams.id;
  
  if (!registerId) {
    return NextResponse.json({ error: 'Register ID is required' }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const { writeValue } = await request.json();

    if (writeValue === undefined) {
      return NextResponse.json({ error: 'writeValue is required in the request body' }, { status: 400 });
    }

    // `buildings` koleksiyonundaki bir `flowData` içindeki ilgili `node`'u bul ve güncelle.
    // Bu, oldukça karmaşık bir güncelleme işlemi gerektirir, çünkü register'lar binalar, katlar veya odalar içinde olabilir.
    // `$set` ile doğrudan `flowData.nodes.$[elem].data.writeValue` alanını hedefleyeceğiz.
    const result = await db.collection('buildings').updateMany(
      { "flowData.nodes.id": registerId },
      {
        $set: { "flowData.nodes.$[elem].data.writeValue": writeValue }
      },
      {
        arrayFilters: [{ "elem.id": registerId }]
      }
    );
    
    // Katlar için de aynı işlemi yap.
    const floorResult = await db.collection('buildings').updateMany(
      { "floors.flowData.nodes.id": registerId },
      { 
          $set: { "floors.$[].flowData.nodes.$[elem].data.writeValue": writeValue }
      },
      {
        arrayFilters: [{ "elem.id": registerId }]
      }
    );

    // Odalar için de aynı işlemi yap.
    const roomResult = await db.collection('buildings').updateMany(
      { "floors.rooms.flowData.nodes.id": registerId },
      { 
          $set: { "floors.$[].rooms.$[].flowData.nodes.$[elem].data.writeValue": writeValue }
      },
      {
        arrayFilters: [{ "elem.id": registerId }]
      }
    );

    if (result.modifiedCount === 0 && floorResult.modifiedCount === 0 && roomResult.modifiedCount === 0) {
      backendLogger.warning(`Register with ID ${registerId} not found in any building, floor, or room to update.`, 'API/registers/[id]');
      // return NextResponse.json({ error: 'Register not found or not updated' }, { status: 404 });
    }
    
    backendLogger.info(`Successfully updated writeValue for register ${registerId} to ${writeValue}`, 'API/registers/[id]');

    return NextResponse.json({
      success: true,
      message: `Register ${registerId} updated successfully.`,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Failed to update register ${registerId}`, 'API/registers/[id]', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to update register in database' }, { status: 500 });
  }
}