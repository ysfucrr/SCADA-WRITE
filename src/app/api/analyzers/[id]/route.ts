import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';
import path from 'path';
import fs from 'fs';

// Analizör bilgisi alma
export async function GET(
  request: NextRequest,
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
  request: NextRequest,
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
  request: NextRequest,
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

    const connectedTrendLogs = await db.collection('trendLogs').countDocuments({ analyzerId: id });
    if (connectedTrendLogs > 0) {
      return NextResponse.json({ error: 'Analyzer is connected to trend logs, cannot delete.' }, { status: 400 });
    }

    const buildingsWithRegisters = await db.collection('buildings').find({
      $or: [
        { "flowData.nodes.data.analyzerId": id },
        { "floors.flowData.nodes.data.analyzerId": id },
        { "floors.rooms.flowData.nodes.data.analyzerId": id },
      ]
    }).toArray();

    for (const building of buildingsWithRegisters) {
        const nodes = [
            ...(building.flowData?.nodes || []),
            ...building.floors?.flatMap((f:any) => f.flowData?.nodes || []),
            ...building.floors?.flatMap((f:any) => f.rooms?.flatMap((r:any) => r.flowData?.nodes || []))
        ];
        
        const nodesToDelete = nodes.filter(node => node?.data?.analyzerId === id);

        for (const node of nodesToDelete) {
            if (node.data?.onIcon) {
                const iconPath = path.join(process.cwd(), 'public', node.data.onIcon.replace('/api/image', ''));
                if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
            }
            if (node.data?.offIcon) {
                const iconPath = path.join(process.cwd(), 'public', node.data.offIcon.replace('/api/image', ''));
                if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
            }
        }
    }
    
    await db.collection('buildings').updateMany(
      { "flowData.nodes.data.analyzerId": id },
      { $pull: { "flowData.nodes": { "data.analyzerId": id } } as any }
    );
    await db.collection('buildings').updateMany(
      { "floors.flowData.nodes.data.analyzerId": id },
      { $pull: { "floors.$[].flowData.nodes": { "data.analyzerId": id } } as any }
    );
    await db.collection('buildings').updateMany(
      { "floors.rooms.flowData.nodes.data.analyzerId": id },
      { $pull: { "floors.$[].rooms.$[].flowData.nodes": { "data.analyzerId": id } } as any }
    );

    await db.collection('analyzers').deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true, message: 'Analyzer and associated registers/images deleted successfully' });
  } catch (error) {
    console.error('Analyzer deletion failed:', error);
    return NextResponse.json({ error: 'Analyzer deletion failed' }, { status: 500 });
  }
}