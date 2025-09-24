import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';
import { mailService } from '@/lib/mail-service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Generate and send a report immediately
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<any> }
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

    // Fetch trend log data based on the report settings
    const timeLimit = report.last24HoursOnly ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null;
    const trendLogIds = report.trendLogs.map((item: any) => item.id);
    const trendLogEntries = await fetchTrendLogData(db, trendLogIds, timeLimit);
    
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
    const { reportSubject, reportText, reportHtml, entriesByTrendLog, trendLogMap, analyzerMap } = await generateReportContent(
      report,
      trendLogs,
      trendLogEntries,
      db,
      labelMap
    );

    // Send the report
    let success = false;

    if (report.format === 'pdf') {
      // Generate separate PDFs for each trend log
      const attachments = [];
      for (const [trendLogId, entries] of entriesByTrendLog.entries()) {
        const trendLog = trendLogMap.get(trendLogId);
        if (trendLog) {
          const customLabel = labelMap.get(trendLogId);
          const defaultTitle = (() => {
            const analyzer = analyzerMap.get(trendLog.analyzerId);
            return analyzer ? `${analyzer.name} (Slave: ${analyzer.slaveId || 'N/A'})` : trendLog.registerId;
          })();

          const title = customLabel || defaultTitle;
          const pdfBuffer = await generateSinglePdfReport(title, entries, "Periodic Report");

          // Create unique filename
          const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `Periodic_Report_${safeTitle}.pdf`;

          attachments.push({
            filename: filename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          });
        }
      }

      // Send PDFs as attachments
      const notificationHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2563eb; margin-bottom: 10px;">Periodic Report</h2>
            <p style="color: #374151; font-size: 16px; line-height: 1.5;">
              Please find the attached PDF reports generated on ${new Date().toLocaleDateString()}.
            </p>
            <div style="margin-top: 20px; padding: 15px; background-color: #e0f2fe; border-left: 4px solid #2563eb; border-radius: 4px;">
              <p style="margin: 0; color: #1e40af; font-weight: bold;">Report Details:</p>
              <ul style="margin: 10px 0 0 20px; color: #374151;">
                <li>Generated: ${new Date().toLocaleString()}</li>
                <li>Format: PDF Attachments</li>
              </ul>
            </div>
          </div>
        </div>
      `;

      success = await mailService.sendMail(
        reportSubject,
        "Please find the attached PDF reports.",
        notificationHtml,
        3,
        attachments
      );
    } else {
      // Send HTML email
      success = await mailService.sendMail(reportSubject, reportText, reportHtml);
    }

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
async function fetchTrendLogData(db: any, trendLogIds: string[], timeLimit?: Date | null) {
  try {
    // Convert string IDs to ObjectId
    const objectIds = trendLogIds.map((id: string) => new ObjectId(id));

    // Build query
    const query: any = {
      trendLogId: { $in: objectIds }
    };

    // Add time limit if specified
    if (timeLimit) {
      query.timestamp = { $gte: timeLimit };
    }

    const entries = await db.collection('trend_log_entries').find(query).sort({ timestamp: 1 }).toArray();

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
    reportHtml,
    entriesByTrendLog,
    trendLogMap,
    analyzerMap
  };
}

// Helper function to generate a single PDF report for one trend log
async function generateSinglePdfReport(title: string, entries: any[], reportName: string): Promise<Buffer> {
  const doc = new jsPDF();
  const reportDate = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header with background
  doc.setFillColor(102, 126, 234); // Blue background
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(reportName, pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.text(`Generated: ${reportDate.toLocaleDateString()}`, pageWidth / 2, 30, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  let startY = 50;

  // Section title with styling
  doc.setFillColor(241, 245, 249); // Light gray background
  doc.rect(14, startY - 5, pageWidth - 28, 15, 'F');

  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Dark blue
  doc.text(title, 20, startY + 5);

  startY += 20;

  // Table with better styling
  autoTable(doc, {
    head: [['Timestamp', 'Value']],
    body: entries.map(entry => [
      new Date(entry.timestamp).toLocaleString(),
      entry.value
    ]),
    startY: startY,
    theme: 'grid',
    headStyles: {
      fillColor: [71, 85, 105], // Dark slate
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 10,
      cellPadding: 8
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // Very light gray
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Gray
  doc.text('Periodic Report - Confidential', pageWidth / 2, pageHeight - 10, { align: 'center' });

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  return pdfBuffer;
}

// Helper function to generate PDF report (legacy, kept for compatibility)
async function generatePdfReport(reportName: string, trendLogData: Map<string, any[]>): Promise<Buffer> {
  const doc = new jsPDF();
  const reportDate = new Date();

  doc.setFontSize(20);
  doc.text(reportName, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`Report Date: ${reportDate.toLocaleDateString()}`, doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });

  let startY = 40;

  for (const [title, entries] of trendLogData.entries()) {
    if (startY > 260) { // Add new page if content overflows
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(14);
    doc.text(title, 14, startY);
    startY += 10;

    autoTable(doc, {
      head: [['Timestamp', 'Value']],
      body: entries.map(entry => [
        new Date(entry.timestamp).toLocaleString(),
        entry.value
      ]),
      startY: startY,
      theme: 'grid',
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
      styles: { fontSize: 10 },
    });

    startY = (doc as any).lastAutoTable.finalY + 15;
  }

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  return pdfBuffer;
}