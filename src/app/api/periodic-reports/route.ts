import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';

// Get all periodic reports
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'admin' && session.user.permissions?.trendLog === false)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const periodicReports = await db.collection('periodicReports').find({}).toArray();

    // Format the reports for the response
    const formattedReports = periodicReports.map(report => ({
      ...report,
      _id: report._id.toString(),
      createdAt: report.createdAt ? new Date(report.createdAt).toISOString() : null,
      updatedAt: report.updatedAt ? new Date(report.updatedAt).toISOString() : null,
      lastSent: report.lastSent ? new Date(report.lastSent).toISOString() : null
    }));

    return NextResponse.json(formattedReports);
  } catch (error) {
    console.error('Periodic reports could not be fetched:', error);
    return NextResponse.json({ error: 'Periodic reports could not be fetched' }, { status: 500 });
  }
}

// Create a new periodic report
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'admin' && session.user.permissions?.trendLog === false)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      frequency,
      schedule,
      format,
      last24HoursOnly,
      trendLogIds
      // recipients now managed through centralized mail settings
    } = body;

    // Validate required fields
    if (!name || !frequency || !schedule || !trendLogIds) {
      return NextResponse.json({
        error: 'Missing required fields: name, frequency, schedule, and trendLogIds are required'
      }, { status: 400 });
    }

    // Validate schedule based on frequency
    if (frequency === 'weekly' && schedule.dayOfWeek === undefined) {
      return NextResponse.json({ error: 'Day of week is required for weekly reports' }, { status: 400 });
    }
    
    if (frequency === 'monthly' && schedule.dayOfMonth === undefined) {
      return NextResponse.json({ error: 'Day of month is required for monthly reports' }, { status: 400 });
    }

    if (schedule.hour === undefined || schedule.minute === undefined) {
      return NextResponse.json({ error: 'Hour and minute are required in the schedule' }, { status: 400 });
    }

    // Validate trendLogIds (at least one)
    if (!trendLogIds.length) {
      return NextResponse.json({ error: 'At least one trend log must be selected' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Validate that all trendLogIds exist
    const trendLogs = await db.collection('trendLogs').find({
      _id: { $in: trendLogIds.map((id: string) => new ObjectId(id)) }
    }).toArray();

    if (trendLogs.length !== trendLogIds.length) {
      return NextResponse.json({ error: 'One or more trend log IDs are invalid' }, { status: 400 });
    }

    // Create the report
    const now = new Date();
    const periodicReport = await db.collection('periodicReports').insertOne({
      name,
      description: description || '',
      frequency,
      schedule,
      format: format || 'html',
      last24HoursOnly: last24HoursOnly || false,
      trendLogIds,
      timezone: "Europe/Istanbul",
      active: true,
      createdAt: now,
      updatedAt: now
      // Email recipients are now managed through centralized mail settings
    });

    return NextResponse.json({
      _id: periodicReport.insertedId.toString(),
      name,
      description: description || '',
      frequency,
      schedule,
      format: format || 'html',
      last24HoursOnly: last24HoursOnly || false,
      trendLogIds,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
      // Email recipients are now managed through centralized mail settings
    }, { status: 201 });
  } catch (error) {
    console.error('Periodic report could not be created:', error);
    return NextResponse.json({ error: 'Periodic report could not be created' }, { status: 500 });
  }
}