import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { AlertRule } from '@/types/alert-rule';
import { backendLogger } from '@/lib/logger/BackendLogger';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const rules = await db.collection('alert_rules').find({}).sort({ name: 1 }).toArray();
    return NextResponse.json(rules);
  } catch (error) {
    backendLogger.error('Failed to fetch alert rules', 'API/alert-rules', { error });
    return NextResponse.json({ error: 'Failed to fetch alert rules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rule: Omit<AlertRule, '_id'> = await request.json();
    const { db } = await connectToDatabase();
    
    const result = await db.collection('alert_rules').insertOne(rule);
    
    // The alert manager will reload itself via change streams.
    
    return NextResponse.json({ ...rule, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    backendLogger.error('Failed to create alert rule', 'API/alert-rules', { error });
    return NextResponse.json({ error: 'Failed to create alert rule' }, { status: 500 });
  }
}