import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';

// Analizör bilgisi alma
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { id } = await params;

    const { db } = await connectToDatabase();
    
    let analyzerId;
    try {
      analyzerId = new ObjectId(id);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid analyzer ID format' }, { status: 400 });
    }
    const analyzer = await db.collection('analyzers').findOne({ _id: analyzerId });

    if (!analyzer) {
      return NextResponse.json({ error: 'Analyzer not found' }, { status: 404 });
    }

    return NextResponse.json(analyzer);
  } catch (error) {
    console.error('Error fetching analyzer:', error);
    return NextResponse.json({ error: 'Failed to fetch analyzer' }, { status: 500 });
  }
}

// Analizör güncelleme
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { name, slaveId, model, poll, timeout, ctRadio, vtRadio, connection, gateway, unit } = await request.json();

    if (!name || !slaveId || !model || !poll || !timeout || !ctRadio || !vtRadio || !connection || !gateway) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const existingAnalyzer = await db.collection('analyzers').findOne({
      name,
      _id: { $ne: new ObjectId(id) }
    });

    if (existingAnalyzer) {
      return NextResponse.json({ error: 'Analyzer with the same name already exists' }, { status: 400 });
    }

    const updateData = {
      name,
      slaveId,
      model,
      poll,
      timeout,
      ctRadio,
      vtRadio,
      connection,
      gateway,
      unit,
      updatedAt: new Date()
    };

    const result = await db.collection('analyzers').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Analyzer not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, message: 'Analyzer updated successfully' });
  } catch (error) {
    console.error('Analyzer update failed:', error);
    return NextResponse.json({ error: 'Analyzer update failed' }, { status: 500 });
  }
}

// Analyzer silme
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    const analyzerToDelete = await db.collection('analyzers').findOne({ _id: new ObjectId(id) });
    if (!analyzerToDelete) {
      return NextResponse.json({ error: 'Analyzer not found' }, { status: 404 });
    }

    const connectedTrendLogs = await db.collection('trendLogs').find({ analyzerId: id }).toArray();
    if (connectedTrendLogs.length > 0) {
      return NextResponse.json({ error: 'Analyzer is connected to trend logs, cannot delete.' }, { status: 400 });
    }

    // Find all buildings to remove associated register nodes from them
    const buildings = await db.collection('buildings').find({ "flowData.nodes.data.analyzerId": id }).toArray();
    for (const building of buildings) {
      const newNodes = building.flowData.nodes.filter((node: any) => node.data?.analyzerId !== id);
      const newFloors = (building.floors || []).map((floor: any) => {
        if (floor.flowData?.nodes) {
          floor.flowData.nodes = floor.flowData.nodes.filter((node: any) => node.data?.analyzerId !== id);
        }
        if (floor.rooms) {
            for (const room of floor.rooms) {
                if (room.flowData?.nodes) {
                    room.flowData.nodes = room.flowData.nodes.filter((node: any) => node.data?.analyzerId !== id);
                }
            }
        }
        return floor;
      });

      await db.collection('buildings').updateOne(
          { _id: building._id },
          { $set: { "flowData.nodes": newNodes, floors: newFloors, updatedAt: new Date() } }
      );
    }

    const result = await db.collection('analyzers').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Analyzer not found during delete operation' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Analyzer and associated register nodes deleted successfully' });
  } catch (error) {
    console.error('Analyzer deletion failed:', error);
    return NextResponse.json({ error: 'Analyzer deletion failed' }, { status: 500 });
  }
}
