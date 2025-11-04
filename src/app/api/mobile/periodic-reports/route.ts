import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için periodic reports endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // Periodic reports'ları getir
    const periodicReports = await db.collection('periodicReports').find({}).toArray();
    
    // Format the reports for mobile response
    const formattedReports = periodicReports.map(report => ({
      _id: report._id.toString(),
      description: report.description || '',
      frequency: report.frequency || 'daily',
      schedule: report.schedule || {
        hour: 0,
        minute: 0
      },
      format: report.format || 'pdf',
      last24HoursOnly: report.last24HoursOnly || false,
      trendLogs: report.trendLogs || [],
      active: report.active !== undefined ? report.active : true,
      createdAt: report.createdAt ? new Date(report.createdAt).toISOString() : null,
      updatedAt: report.updatedAt ? new Date(report.updatedAt).toISOString() : null,
      lastSent: report.lastSent ? new Date(report.lastSent).toISOString() : null
    }));
    
    console.log(`Found ${formattedReports.length} periodic reports`);
    
    return NextResponse.json({
      success: true,
      total: formattedReports.length,
      reports: formattedReports
    });
    
  } catch (error) {
    console.error('Mobile periodic reports could not be fetched:', error);
    return NextResponse.json({ 
      error: 'Periodic reports could not be fetched',
      success: false,
      reports: [],
      total: 0
    }, { status: 500 });
  }
}

