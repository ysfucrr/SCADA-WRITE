import cron from 'node-cron';
import { connectToDatabase } from './mongodb';
import { mailService } from './mail-service';
import { backendLogger } from './logger/BackendLogger';
import { ObjectId } from 'mongodb';

// a an import and a an import are missing
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


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

  private async sendConfiguredReport(report: any, db: any) {
    try {
      // Convert string IDs to ObjectIds
      const trendLogIds = report.trendLogs.map((item: any) => new ObjectId(item.id));
      
      // Note: Email recipients are now managed through centralized mail settings
      
      // Fetch trend log entries based on report settings
      const query: any = {
        trendLogId: { $in: trendLogIds }
      };

      if (report.last24HoursOnly) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        query.timestamp = { $gte: twentyFourHoursAgo };
      }

      const entries = await db.collection('trend_log_entries').find(query).sort({ timestamp: 1 }).toArray();
      
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
      
      // Add sections for each trend log
      for (const [trendLogId, logEntries] of entriesByTrendLog.entries()) {
        const trendLog = trendLogMap.get(trendLogId);
        
        if (trendLog) {
          let reportTitle;
          
          try {
            // Güvenli bir şekilde analyzer bilgisini alalım
            const registerId = trendLog.registerId || 'Unknown Register';
            let analyzerInfo = 'Unknown Analyzer';
            
            if (trendLog.analyzerId && analyzerMap.has(trendLog.analyzerId)) {
              const analyzer = analyzerMap.get(trendLog.analyzerId);
              if (analyzer && analyzer.name) {
                analyzerInfo = `${analyzer.name} ${analyzer.slaveId ? `(Slave: ${analyzer.slaveId})` : ''}`;
              }
            }
            
            reportTitle = `${analyzerInfo}`;
          } catch (error) {
            // Fallback to original registerId display if there's any error
            reportTitle = trendLog.registerId || 'Unknown Register';
          }
          
          // Text formatında rapor
          reportText += `Trend Log: ${reportTitle}\n`;
          reportText += `Entries: ${logEntries.length}\n\n`;
          
          for (const entry of logEntries) {
            const timestamp = new Date(entry.timestamp).toLocaleString();
            reportText += `${timestamp} - Value: ${entry.value}\n`;
          }
          
          reportText += '\n';
          
          // HTML formatında rapor
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
      
      // Send the report based on format
      let success = false;
      
      if (report.format === 'pdf') {
        const trendLogDataForPdf = new Map();
        for (const [trendLogId, logEntries] of entriesByTrendLog.entries()) {
            const trendLog = trendLogMap.get(trendLogId);
            if (trendLog) {
                const analyzer = analyzerMap.get(trendLog.analyzerId);
                const title = analyzer ? `${analyzer.name} (Slave: ${analyzer.slaveId || 'N/A'})` : trendLog.registerId;
                trendLogDataForPdf.set(title, logEntries);
            }
        }

        const pdfBuffer = await this.generatePdfReport("Periodic Report", trendLogDataForPdf);

        // When sending a PDF, the HTML body should be a simple notification, not the full report.
        const notificationHtml = `<p>Please find the attached report: <strong>Periodic Report</strong></p>`;

        success = await mailService.sendMail(
          reportSubject,
          "Please find the attached PDF report.", // Simple text body for non-html clients
          notificationHtml, // Simple HTML body
          3, // retry count
          [{ // Attachment object
            filename: `Periodic_Report.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }]
        );

      } else {
        success = await mailService.sendMail(
          reportSubject,
          reportText,
          reportHtml,
          3, // retry count
        );
      }
      
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