import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';

// Get a single periodic report by ID
export async function GET(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'admin' && session.user.permissions?.trendLog === false)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Get ID from params
    const id = params.id;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid report ID format' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const report = await db.collection('periodicReports').findOne({ _id: new ObjectId(id) });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Format the report for the response
    const formattedReport = {
      ...report,
      _id: report._id.toString(),
      createdAt: report.createdAt ? new Date(report.createdAt).toISOString() : null,
      updatedAt: report.updatedAt ? new Date(report.updatedAt).toISOString() : null,
      lastSent: report.lastSent ? new Date(report.lastSent).toISOString() : null
    };

    return NextResponse.json(formattedReport);
  } catch (error) {
    console.error('Report could not be fetched:', error);
    return NextResponse.json({ error: 'Report could not be fetched' }, { status: 500 });
  }
}

// Update a periodic report
export async function PUT(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'admin' && session.user.permissions?.trendLog === false)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Get ID from params
    const id = params.id;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid report ID format' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const existingReport = await db.collection('periodicReports').findOne({ _id: new ObjectId(id) });

    if (!existingReport) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      description,
      frequency,
      schedule,
      format,
      last24HoursOnly,
      trendLogIds,
      active
      // recipients are now managed through centralized mail settings
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

    // Validate that all trendLogIds exist
    const trendLogs = await db.collection('trendLogs').find({
      _id: { $in: trendLogIds.map((id: string) => new ObjectId(id)) }
    }).toArray();

    if (trendLogs.length !== trendLogIds.length) {
      return NextResponse.json({ error: 'One or more trend log IDs are invalid' }, { status: 400 });
    }

    // Update the report
    const now = new Date();
    const updateResult = await db.collection('periodicReports').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name,
          description: description || '',
          frequency,
          schedule,
          format: format || 'html',
          last24HoursOnly: last24HoursOnly !== undefined ? last24HoursOnly : existingReport.last24HoursOnly,
          trendLogIds,
          active: active !== undefined ? active : existingReport.active,
          updatedAt: now
          // Email recipients are now managed through centralized mail settings
        }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json({ error: 'Report could not be updated' }, { status: 500 });
    }

    const updatedReport = await db.collection('periodicReports').findOne({ _id: new ObjectId(id) });
    
    if (!updatedReport) {
      return NextResponse.json({ error: 'Updated report could not be retrieved' }, { status: 500 });
    }
    
    // Format the report for the response
    const formattedReport = {
      ...updatedReport,
      _id: updatedReport._id.toString(),
      createdAt: updatedReport.createdAt ? new Date(updatedReport.createdAt).toISOString() : null,
      updatedAt: updatedReport.updatedAt ? new Date(updatedReport.updatedAt).toISOString() : null,
      lastSent: updatedReport.lastSent ? new Date(updatedReport.lastSent).toISOString() : null
    };

    return NextResponse.json(formattedReport);
  } catch (error) {
    console.error('Report could not be updated:', error);
    return NextResponse.json({ error: 'Report could not be updated' }, { status: 500 });
  }
}

// Delete a periodic report
export async function DELETE(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'admin' && session.user.permissions?.trendLog === false)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Get ID from params
    const id = params.id;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid report ID format' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const deleteResult = await db.collection('periodicReports').deleteOne({ _id: new ObjectId(id) });

    if (deleteResult.deletedCount === 0) {
      return NextResponse.json({ error: 'Report not found or could not be deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Report could not be deleted:', error);
    return NextResponse.json({ error: 'Report could not be deleted' }, { status: 500 });
  }
}