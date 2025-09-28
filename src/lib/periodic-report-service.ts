import cron from 'node-cron';
import { connectToDatabase } from './mongodb';
import { mailService } from './mail-service';
import { backendLogger } from './logger/BackendLogger';
import { ObjectId } from 'mongodb';

// a an import and a an import are missing
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as archiver from 'archiver';
import { Readable } from 'stream';


class PeriodicReportService {
  constructor() {
    this.initializeSchedules();
  }

  private initializeSchedules() {
    // Schedule to check for reports every minute
    cron.schedule('* * * * *', () => {
      this.checkAndSendScheduledReports();
    }, {
      timezone: "Europe/Istanbul"
    });

  }

  private async checkAndSendScheduledReports() {
    try {
      const { db } = await connectToDatabase();
      const now = new Date();

      // Find all active reports
      const reports = await db.collection('periodicReports').find({
        active: true
      }).toArray();

      if (!reports || reports.length === 0) {
        return;
      }

      for (const report of reports) {
        if (this.shouldSendReport(report, now)) {
          backendLogger.info(`Sending scheduled report: ${report.description || 'Periodic Report'}`, 'PeriodicReportService');
          await this.sendConfiguredReport(report, db);
        }
      }
    } catch (error) {
      backendLogger.error('An error occurred checking scheduled reports.', 'PeriodicReportService', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  private shouldSendReport(report: any, now: Date): boolean {
    // Check if report should be sent based on schedule
    const lastSent = report.lastSent ? new Date(report.lastSent) : null;
    const { frequency, schedule } = report;
    
    // If no lastSent time or it's the same minute, don't send
    if (lastSent &&
        lastSent.getFullYear() === now.getFullYear() &&
        lastSent.getMonth() === now.getMonth() &&
        lastSent.getDate() === now.getDate() &&
        lastSent.getHours() === now.getHours() &&
        lastSent.getMinutes() === now.getMinutes()) {
      return false;
    }

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0-6 (Sunday-Saturday)
    const currentDate = now.getDate(); // 1-31
    
    // Check if the current time matches the scheduled time
    if (currentHour === schedule.hour && currentMinute === schedule.minute) {
      if (frequency === 'daily') {
        return true;
      } else if (frequency === 'weekly' && currentDay === schedule.dayOfWeek) {
        return true;
      } else if (frequency === 'monthly' && currentDate === schedule.dayOfMonth) {
        return true;
      }
    }
    
    return false;
  }

  private async fetchTrendLogDataForAutoReport(db: any, trendLogIds: ObjectId[], timeLimit?: Date | null) {
    try {
      // Build query
      const query: any = {
        trendLogId: { $in: trendLogIds }
      };

      // Add time limit if specified
      if (timeLimit) {
        query.timestamp = { $gte: timeLimit };
      }

      // Fetch trend log information to determine which collection to use
      const trendLogsInfo = await db.collection('trendLogs').find({
        _id: { $in: trendLogIds }
      }, { projection: { _id: 1, period: 1 }}).toArray();

      // Create maps for onChange and regular trend logs
      const onChangeTrendLogIds = new Set();
      const regularTrendLogIds = new Set();

      trendLogsInfo.forEach((log: any) => {
        if (log.period === 'onChange') {
          onChangeTrendLogIds.add(log._id.toString());
        } else {
          regularTrendLogIds.add(log._id.toString());
        }
      });

      // Prepare array to collect all entries
      let allEntries: any[] = [];

      // Fetch from trend_log_entries if we have regular trend logs
      if (regularTrendLogIds.size > 0) {
        const regularQuery = { ...query };
        regularQuery.trendLogId = { $in: Array.from(regularTrendLogIds).map(id => new ObjectId(id as string)) };
        const regularEntries = await db.collection('trend_log_entries')
          .find(regularQuery)
          .sort({ timestamp: 1 })
          .toArray();
        allEntries = allEntries.concat(regularEntries);
      }

      // Fetch from trend_log_entries_onchange if we have onChange trend logs
      if (onChangeTrendLogIds.size > 0) {
        const onChangeQuery = { ...query };
        onChangeQuery.trendLogId = { $in: Array.from(onChangeTrendLogIds).map(id => new ObjectId(id as string)) };
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
      backendLogger.error('Error fetching trend log data for auto report', 'PeriodicReportService', {
        error: (error as Error).message
      });
      return [];
    }
  }

  private async sendConfiguredReport(report: any, db: any) {
    try {
      // Convert string IDs to ObjectIds
      const trendLogIds = report.trendLogs.map((item: any) => new ObjectId(item.id));

      // Note: Email recipients are now managed through centralized mail settings

      // Fetch trend log entries based on report settings using the same logic as manual generation
      const timeLimit = report.last24HoursOnly ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null;
      const entries = await this.fetchTrendLogDataForAutoReport(db, trendLogIds, timeLimit);

      if (entries.length === 0) {
        backendLogger.info(`No trend logs found for report: ${report.description || 'Periodic Report'}. Skipping.`, 'PeriodicReportService');
        return;
      }
      
      // Fetch trend log details for creating better report labels
      const trendLogs = await db.collection('trendLogs').find({
        _id: { $in: trendLogIds }
      }).toArray();
      
      // Create a map for quick lookups
      const trendLogMap = new Map();
      
      // Safely fetch analyzer details if possible
      let analyzerMap = new Map();
      try {
        if (trendLogs && trendLogs.length > 0) {
          // Filter out null or undefined analyzerId values
          const analyzerIds = trendLogs
            .filter((log: any) => log && log.analyzerId)
            .map((log: any) => log.analyzerId)
            .filter(Boolean);
            
          if (analyzerIds && analyzerIds.length > 0) {
            // Convert string IDs to ObjectIds, handling potential errors
            const objectIds = analyzerIds
              .filter((id: any) => id && typeof id === 'string')
              .map((id: string) => {
                try {
                  return new ObjectId(id);
                } catch (e) {
                  backendLogger.error(`Invalid ObjectId: ${id}`, 'PeriodicReportService');
                  return null;
                }
              })
              .filter(Boolean);
              
            if (objectIds && objectIds.length > 0) {
              const analyzers = await db.collection('analyzers').find({
                _id: { $in: objectIds }
              }).toArray();
              
              // Build analyzer map
              for (const analyzer of analyzers) {
                if (analyzer && analyzer._id) {
                  analyzerMap.set(analyzer._id.toString(), analyzer);
                }
              }
            }
          }
        }
      } catch (error) {
        // Don't let analyzer fetch errors stop the whole report
        backendLogger.error('Error fetching analyzer data for report', 'PeriodicReportService', {
          error: (error as Error).message
        });
      }
      
      for (const log of trendLogs) {
        trendLogMap.set(log._id.toString(), log);
      }
      
      // Group entries by trend log
      const entriesByTrendLog = new Map();
      for (const entry of entries) {
        const trendLogId = entry.trendLogId.toString();
        
        if (!entriesByTrendLog.has(trendLogId)) {
          entriesByTrendLog.set(trendLogId, []);
        }
        
        entriesByTrendLog.get(trendLogId).push(entry);
      }
      
      // Create label map from report.trendLogs
      const labelMap = new Map<string, string>(report.trendLogs.map((item: any) => [item.id, item.label]));

      // Generate report content
      const reportSubject = `Periodic Report - ${new Date().toLocaleDateString()}`;

      let reportText = `Periodic Report\n\nDate: ${new Date().toLocaleDateString()}\n\n`;
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
      
      // Add sections for each trend log (for HTML content, though we only use PDF now)
      for (const [trendLogId, logEntries] of entriesByTrendLog.entries()) {
        const trendLog = trendLogMap.get(trendLogId);

        if (trendLog) {
          const customLabel = labelMap.get(trendLogId);
          const defaultTitle = (() => {
            const analyzer = analyzerMap.get(trendLog.analyzerId);
            return analyzer ? `${analyzer.name} (Slave: ${analyzer.slaveId || 'N/A'})` : trendLog.registerId;
          })();

          const reportTitle = customLabel || defaultTitle;

          // Text formatında rapor
          reportText += `Trend Log: ${reportTitle}\n`;
          reportText += `Entries: ${logEntries.length}\n\n`;

          for (const entry of logEntries) {
            const timestamp = new Date(entry.timestamp).toLocaleString();
            reportText += `${timestamp} - Value: ${entry.value}\n`;
          }

          reportText += '\n';

          // HTML formatında rapor (kept for compatibility)
          reportHtml += `
            <div class="section">
              <h2>Trend Log: ${reportTitle}</h2>
              <p>Entries: ${logEntries.length}</p>

              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
          `;

          for (const entry of logEntries) {
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
      
      // Send the report - only PDF format supported
      let success = false;

      // Generate separate PDFs for each trend log
      const attachments = [];
      for (const [trendLogId, logEntries] of entriesByTrendLog.entries()) {
        const trendLog = trendLogMap.get(trendLogId);
        if (trendLog) {
          const customLabel = labelMap.get(trendLogId);
          const defaultTitle = (() => {
            const analyzer = analyzerMap.get(trendLog.analyzerId);
            return analyzer ? `${analyzer.name} (Slave: ${analyzer.slaveId || 'N/A'})` : trendLog.registerId;
          })();

          const title = customLabel || defaultTitle;
          const pdfBuffer = await this.generateSinglePdfReport(title, logEntries, "Periodic Report");

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

      let finalAttachments = attachments;

      // If multiple PDFs, create a ZIP file
      if (attachments.length > 1) {
        const zipBuffer = await this.createZipFromBuffers(attachments);
        finalAttachments = [{
          filename: `Periodic_Report_${new Date().toISOString().split('T')[0]}.zip`,
          content: zipBuffer,
          contentType: 'application/zip'
        }];
      }

      // Send attachments
      const notificationHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2563eb; margin-bottom: 10px;">Periodic Report</h2>
            <p style="color: #374151; font-size: 16px; line-height: 1.5;">
              Please find the attached ${attachments.length > 1 ? 'ZIP file containing PDF reports' : 'PDF report'} generated on ${new Date().toLocaleDateString()}.
            </p>
            <div style="margin-top: 20px; padding: 15px; background-color: #e0f2fe; border-left: 4px solid #2563eb; border-radius: 4px;">
              <p style="margin: 0; color: #1e40af; font-weight: bold;">Report Details:</p>
              <ul style="margin: 10px 0 0 20px; color: #374151;">
                <li>Generated: ${new Date().toLocaleString()}</li>
                <li>Format: ${attachments.length > 1 ? 'ZIP (Multiple PDFs)' : 'PDF'}</li>
                <li>Number of reports: ${attachments.length}</li>
              </ul>
            </div>
          </div>
        </div>
      `;

      success = await mailService.sendMail(
        reportSubject,
        `Please find the attached ${attachments.length > 1 ? 'ZIP file with PDF reports' : 'PDF report'}.`,
        notificationHtml,
        3,
        finalAttachments
      );
      
      if (success) {
        // Update the lastSent timestamp
        await db.collection('periodicReports').updateOne(
          { _id: report._id },
          {
            $set: {
              lastSent: new Date(),
              updatedAt: new Date()
            }
          }
        );
        
        backendLogger.info(`Report "Periodic Report" sent successfully.`, 'PeriodicReportService');
      } else {
        backendLogger.error(`Failed to send report "Periodic Report".`, 'PeriodicReportService');
      }
    } catch (error) {
      backendLogger.error(`An error occurred while sending report "Periodic Report".`, 'PeriodicReportService', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }


  private async generateSinglePdfReport(title: string, entries: any[], reportName: string): Promise<Buffer> {
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

  private async createZipFromBuffers(attachments: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver.create('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      const buffers: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });

      archive.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      archive.on('error', reject);

      // Add each PDF buffer to the ZIP
      attachments.forEach((attachment) => {
        const bufferStream = Readable.from(attachment.content);
        archive.append(bufferStream, { name: attachment.filename });
      });

      archive.finalize();
    });
  }

  private async generatePdfReport(reportName: string, trendLogData: Map<string, any[]>): Promise<Buffer> {
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

}

// Initialize the service
export const periodicReportService = new PeriodicReportService();