import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { ObjectId } from 'mongodb';

// @ts-ignore - Next.js App Router tiplerini bypass et
export async function PUT(request: Request, context) {
  // Parametre formatını kontrol et ve uyumlu şekilde işle
  const params = context.params ? context.params : context;
  // Promise kontrolü - params bir Promise olabilir
  const awaitedParams = await Promise.resolve(params);
  const registerId = awaitedParams.id;
  
  if (!registerId) {
    return NextResponse.json({ error: 'Register ID is required' }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const requestBody = await request.json();
    const { writeValue, lastValue } = requestBody;
    
    // İstek hem writeValue hem de lastValue içerirse lastValue'yu tercih et
    // Sadece writeValue varsa geriye dönük uyumluluk için onu kullan
    const valueToUpdate = lastValue !== undefined ? lastValue : writeValue;

    if (valueToUpdate === undefined) {
      return NextResponse.json({ error: 'writeValue or lastValue is required in the request body' }, { status: 400 });
    }

    // `buildings` koleksiyonundaki bir `flowData` içindeki ilgili `node`'u bul ve güncelle.
    // Bu, oldukça karmaşık bir güncelleme işlemi gerektirir, çünkü register'lar binalar, katlar veya odalar içinde olabilir.
    // `$set` ile doğrudan `flowData.nodes.$[elem].data.writeValue` alanını hedefleyeceğiz.
    const result = await db.collection('buildings').updateMany(
      { "flowData.nodes.id": registerId },
      {
        $set: {
          "flowData.nodes.$[elem].data.lastValue": valueToUpdate
          // writeValue artık güncellenmeyecek, sadece lastValue güncellenecek
        }
      },
      {
        arrayFilters: [{ "elem.id": registerId }]
      }
    );
    
    // Katlar için de aynı işlemi yap.
    const floorResult = await db.collection('buildings').updateMany(
      { "floors.flowData.nodes.id": registerId },
      {
          $set: {
            "floors.$[].flowData.nodes.$[elem].data.lastValue": valueToUpdate
            // writeValue artık güncellenmeyecek, sadece lastValue güncellenecek
          }
      },
      {
        arrayFilters: [{ "elem.id": registerId }]
      }
    );

    // Odalar için de aynı işlemi yap.
    const roomResult = await db.collection('buildings').updateMany(
      { "floors.rooms.flowData.nodes.id": registerId },
      {
          $set: {
            "floors.$[].rooms.$[].flowData.nodes.$[elem].data.lastValue": valueToUpdate
            // writeValue artık güncellenmeyecek, sadece lastValue güncellenecek
          }
      },
      {
        arrayFilters: [{ "elem.id": registerId }]
      }
    );

    if (result.modifiedCount === 0 && floorResult.modifiedCount === 0 && roomResult.modifiedCount === 0) {
      backendLogger.warning(`Register with ID ${registerId} not found in any building, floor, or room to update.`, 'API/registers/[id]');
    }

    backendLogger.info(`Successfully updated lastValue for register ${registerId} to ${valueToUpdate}`, 'API/registers/[id]');

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

// @ts-ignore - Next.js App Router tiplerini bypass et
export async function DELETE(request: Request, context) {
  // Parametre formatını kontrol et ve uyumlu şekilde işle
  const params = context.params ? context.params : context;
  // Promise kontrolü - params bir Promise olabilir
  const awaitedParams = await Promise.resolve(params);
  const registerId = awaitedParams.id;

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