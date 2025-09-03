import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { AlertRule } from '@/types/alert-rule';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic'; // Ensures the route is always dynamic

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const rule = await db.collection('alert_rules').findOne({ _id: new ObjectId(id) });

    if (!rule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }
    return NextResponse.json(rule);
  } catch (error) {
    backendLogger.error('Failed to fetch alert rule', 'API/alert-rules/[id]', { error });
    return NextResponse.json({ error: 'Failed to fetch alert rule' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const updates: Partial<AlertRule> = await request.json();
    delete updates._id; // Ensure the _id is not updated

    const { db } = await connectToDatabase();
    const result = await db.collection('alert_rules').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    // The alert manager will reload itself via change streams.
    return NextResponse.json({ message: 'Alert rule updated successfully' });
  } catch (error) {
    backendLogger.error('Failed to update alert rule', 'API/alert-rules/[id]', { error });
    return NextResponse.json({ error: 'Failed to update alert rule' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: 'Alert rule ID is missing' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const result = await db.collection('alert_rules').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }
    
    // The alert manager will reload itself via change streams.
    return NextResponse.json({ message: 'Alert rule deleted successfully' });
  } catch (error) {
    backendLogger.error('Failed to delete alert rule', 'API/alert-rules/[id]', { error, params });
    // Differentiate between server error and a bad ObjectId format error
    if (error instanceof Error && error.message.includes('ObjectId')) {
        return NextResponse.json({ error: 'Malformed alert rule ID.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete alert rule' }, { status: 500 });
  }
}