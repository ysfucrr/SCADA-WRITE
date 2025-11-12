import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';

// Preview a report without sending it
export async function GET(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'admin' && session.user.permissions?.trendLog === false)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const resolvedParams = await params;
    // Get ID from params
    const id = resolvedParams.id;
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
    const trendLogIds = report.trendLogs.map((item: any) => item.id);
    const trendLogEntries = await fetchTrendLogData(db, trendLogIds);

    if (!trendLogEntries || trendLogEntries.length === 0) {
      return NextResponse.json({ error: 'No trend log data available for the report' }, { status: 400 });
    }

    // Fetch trend log details for creating better report labels
    const trendLogs = await db.collection('trendLogs').find({
      _id: { $in: trendLogIds.map((id: string) => new ObjectId(id)) }
    }).toArray();
    
    // Fetch analyzer details for better display
    const analyzerIds = trendLogs.map((log: any) => log.analyzerId).filter(Boolean);
    const analyzers = await db.collection('analyzers').find({
      _id: { $in: analyzerIds.map((id: string) => new ObjectId(id)) }
    }).toArray();

    // Create label map from report.trendLogs
    const labelMap = new Map<string, string>(report.trendLogs.map((item: any) => [item.id, item.label]));

    // Generate the report content
    const { reportSubject, reportText, reportHtml } = await generateReportContent(
      report,
      trendLogs,
      trendLogEntries,
      db,
      labelMap
    );

    // Fetch mail settings to show recipient information
    const mailSettings = await db.collection('mail_settings').findOne({});
    
    return NextResponse.json({ 
      success: true,
      preview: {
        subject: reportSubject,
        html: reportHtml,
        recipients: mailSettings?.to || []
      }
    });
  } catch (error) {
    console.error('Failed to generate report preview:', error);
    return NextResponse.json({ 
      error: 'Failed to generate report preview' 
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

    // Fetch trend log information to determine which collection to use
    const trendLogsInfo = await db.collection('trendLogs').find({
      _id: { $in: objectIds }
    }, { projection: { _id: 1, period: 1, isKWHCounter: 1 }}).toArray();

    // Create maps for different collection types
    const onChangeTrendLogIds = new Set();
    const regularTrendLogIds = new Set();
    const kwhTrendLogIds = new Set();

    trendLogsInfo.forEach((log: any) => {
      if (log.isKWHCounter) {
        kwhTrendLogIds.add(log._id.toString());
      } else if (log.period === 'onChange') {
        onChangeTrendLogIds.add(log._id.toString());
      } else {
        regularTrendLogIds.add(log._id.toString());
      }
    });

    // Prepare array to collect all entries
    let allEntries: any[] = [];

    // Fetch from trend_log_entries_kwh if we have KWH Counter trend logs
    if (kwhTrendLogIds.size > 0) {
      const kwhQuery = {
        trendLogId: { $in: Array.from(kwhTrendLogIds).map(id => new ObjectId(id as string)) },
        timestamp: { $gte: twentyFourHoursAgo }
      };
      const kwhEntries = await db.collection('trend_log_entries_kwh')
        .find(kwhQuery)
        .sort({ timestamp: 1 })
        .toArray();
      allEntries = allEntries.concat(kwhEntries);
    }

    // Fetch from trend_log_entries if we have regular trend logs
    if (regularTrendLogIds.size > 0) {
      const regularQuery = {
        trendLogId: { $in: Array.from(regularTrendLogIds).map(id => new ObjectId(id as string)) },
        timestamp: { $gte: twentyFourHoursAgo }
      };
      const regularEntries = await db.collection('trend_log_entries')
        .find(regularQuery)
        .sort({ timestamp: 1 })
        .toArray();
      allEntries = allEntries.concat(regularEntries);
    }

    // Fetch from trend_log_entries_onchange if we have onChange trend logs
    if (onChangeTrendLogIds.size > 0) {
      const onChangeQuery = {
        trendLogId: { $in: Array.from(onChangeTrendLogIds).map(id => new ObjectId(id as string)) },
        timestamp: { $gte: twentyFourHoursAgo }
      };
      const onChangeEntries = await db.collection('trend_log_entries_onchange')
        .find(onChangeQuery)
        .sort({ timestamp: 1 })
        .toArray();
      allEntries = allEntries.concat(onChangeEntries);
    }

    // Sort all entries by timestamp
    allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return allEntries;
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
  db: any,
  labelMap: Map<string, string>
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
  const reportSubject = `Periodic Report - ${new Date().toLocaleDateString()}`;

  // Generate report text
  let reportText = `Periodic Report\n\nDate: ${new Date().toLocaleDateString()}\n\n`;

  for (const [trendLogId, entries] of entriesByTrendLog.entries()) {
    const trendLog = trendLogMap.get(trendLogId);

    if (trendLog) {
      const customLabel = labelMap.get(trendLogId);
      const defaultTitle = (() => {
        const analyzer = trendLog.analyzerId ? analyzerMap.get(trendLog.analyzerId) : null;
        return analyzer ? `${analyzer.name} (Slave: ${analyzer.slaveId || 'N/A'})` : trendLog.registerId;
      })();

      const title = customLabel || defaultTitle;

      reportText += `Trend Log: ${title}\n`;
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
      <h1>Periodic Report</h1>
      <p>Date: ${new Date().toLocaleDateString()}</p>
  `;

  // Add sections for each trend log
  for (const [trendLogId, entries] of entriesByTrendLog.entries()) {
    const trendLog = trendLogMap.get(trendLogId);

    if (trendLog) {
      const customLabel = labelMap.get(trendLogId);
      const defaultTitle = (() => {
        const analyzer = trendLog.analyzerId ? analyzerMap.get(trendLog.analyzerId) : null;
        return analyzer ? `${analyzer.name} (Slave: ${analyzer.slaveId || 'N/A'})` : trendLog.registerId;
      })();

      const title = customLabel || defaultTitle;

      reportHtml += `
        <div class="section">
          <h2>Trend Log: ${title}</h2>
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