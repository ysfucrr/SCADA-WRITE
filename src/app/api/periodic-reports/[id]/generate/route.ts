import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';
import { mailService } from '@/lib/mail-service';

// Generate and send a report immediately
export async function POST(
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
    
    // Fetch the report configuration
    const report = await db.collection('periodicReports').findOne({ _id: new ObjectId(id) });
    
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Fetch trend logs data for the specified trend logs
    const trendLogEntries = await fetchTrendLogData(db, report.trendLogIds);
    
    if (!trendLogEntries || trendLogEntries.length === 0) {
      return NextResponse.json({ error: 'No trend log data available for the report' }, { status: 400 });
    }

    // Fetch trend log details for creating better report labels
    const trendLogs = await db.collection('trendLogs').find({
      _id: { $in: report.trendLogIds.map((id: string) => new ObjectId(id)) }
    }).toArray();
    
    // Fetch analyzer details for better display
    const analyzerIds = trendLogs.map((log: any) => log.analyzerId).filter(Boolean);
    const analyzers = await db.collection('analyzers').find({
      _id: { $in: analyzerIds.map((id: string) => new ObjectId(id)) }
    }).toArray();

    // Generate the report content
    const { reportSubject, reportText, reportHtml } = await generateReportContent(
      report,
      trendLogs,
      trendLogEntries,
      db
    );

    // Send the report
    let success = false;

    // PDF generation logic has been removed from this route.
    // The primary PDF generation is now handled by the persistent periodic-report-service.
    // This route will now only send a standard HTML/text email.
    success = await mailService.sendMail(reportSubject, reportText, reportHtml);

    if (!success) {
      return NextResponse.json({ error: 'Failed to send the report email' }, { status: 500 });
    }

    // Update the lastSent timestamp
    await db.collection('periodicReports').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          lastSent: new Date(),
          updatedAt: new Date()
        }
      }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Report generated and sent successfully'
    });
  } catch (error) {
    console.error('Failed to generate and send report:', error);
    return NextResponse.json({ 
      error: 'Failed to generate and send report' 
    }, { status: 500 });
  }
}

// Helper function to fetch trend log data
async function fetchTrendLogData(db: any, trendLogIds: string[]) {
  try {
    // Convert string IDs to ObjectId
    const objectIds = trendLogIds.map((id: string) => new ObjectId(id));

    // Get the last 24 hours of data for each trend log
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const entries = await db.collection('trend_log_entries').find({
      trendLogId: { $in: objectIds },
      timestamp: { $gte: twentyFourHoursAgo }
    }).sort({ timestamp: 1 }).toArray();

    return entries;
  } catch (error) {
    console.error('Error fetching trend log data:', error);
    return [];
  }
}

// Helper function to generate report content
async function generateReportContent(
  report: any,
  trendLogs: any[],
  trendLogEntries: any[],
  db: any
) {
  // Create maps for trend logs and analyzers
  const trendLogMap = new Map();
  for (const log of trendLogs) {
    trendLogMap.set(log._id.toString(), log);
  }
  
  // Fetch and create analyzer map
  const analyzerMap = new Map();
  const analyzerIds = trendLogs.map((log: any) => log.analyzerId).filter(Boolean);
  
  if (analyzerIds.length > 0) {
    const analyzers = await db.collection('analyzers').find({
      _id: { $in: analyzerIds.map((id: string) => new ObjectId(id)) }
    }).toArray();
    
    for (const analyzer of analyzers) {
      analyzerMap.set(analyzer._id.toString(), analyzer);
    }
  }

  // Create a map of trend log entries by trendLogId
  const entriesByTrendLog = new Map();
  for (const entry of trendLogEntries) {
    const trendLogId = entry.trendLogId.toString();
    
    if (!entriesByTrendLog.has(trendLogId)) {
      entriesByTrendLog.set(trendLogId, []);
    }
    
    entriesByTrendLog.get(trendLogId).push(entry);
  }

  // Generate report subject
  const reportSubject = `${report.name} - ${new Date().toLocaleDateString()}`;
  
  // Generate report text
  let reportText = `${report.name}\n\nDate: ${new Date().toLocaleDateString()}\n\n`;
  
  for (const [trendLogId, entries] of entriesByTrendLog.entries()) {
    const trendLog = trendLogMap.get(trendLogId);
    
    if (trendLog) {
      // Analyzer bilgisini al
      const analyzer = trendLog.analyzerId ? analyzerMap.get(trendLog.analyzerId) : null;
      const analyzerName = analyzer ? analyzer.name : 'Unknown Analyzer';
      const analyzerSlaveId = analyzer ? analyzer.slaveId : 'N/A';
      
      reportText += `Trend Log: ${analyzerName} (Slave: ${analyzerSlaveId})\n`;
      reportText += `Entries: ${entries.length}\n\n`;
      
      for (const entry of entries) {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        reportText += `${timestamp} - Value: ${entry.value}\n`;
      }
      
      reportText += '\n';
    }
  }

  // Generate report HTML
  let reportHtml = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; }
        h1 { color: #2563eb; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th { background-color: #e5edff; color: #1e40af; font-weight: bold; text-align: left; padding: 8px; }
        td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
        .section { margin-bottom: 30px; }
      </style>
    </head>
    <body>
      <h1>${report.name}</h1>
      <p>Date: ${new Date().toLocaleDateString()}</p>
  `;

  // Add sections for each trend log
  for (const [trendLogId, entries] of entriesByTrendLog.entries()) {
    const trendLog = trendLogMap.get(trendLogId);
    
    if (trendLog) {
      // Analyzer bilgisini al
      const analyzer = trendLog.analyzerId ? analyzerMap.get(trendLog.analyzerId) : null;
      const analyzerName = analyzer ? analyzer.name : 'Unknown Analyzer';
      const analyzerSlaveId = analyzer ? analyzer.slaveId : 'N/A';
      
      reportHtml += `
        <div class="section">
          <h2>Trend Log: ${analyzerName} (Slave: ${analyzerSlaveId})</h2>
          <p>Entries: ${entries.length}</p>
          
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      for (const entry of entries) {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        reportHtml += `
          <tr>
            <td>${timestamp}</td>
            <td>${entry.value}</td>
          </tr>
        `;
      }
      
      reportHtml += `
            </tbody>
          </table>
        </div>
      `;
    }
  }

  reportHtml += `
    </body>
    </html>
  `;

  return {
    reportSubject,
    reportText,
    reportHtml
  };
}