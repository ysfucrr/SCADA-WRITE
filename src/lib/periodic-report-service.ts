import cron from 'node-cron';
import { connectToDatabase } from './mongodb';
import { mailService } from './mail-service';
import { backendLogger } from './logger/BackendLogger';

class PeriodicReportService {
  constructor() {
    this.scheduleDailyReport();
  }

  private scheduleDailyReport() {
    // Schedule to run every day at 08:00 AM
    cron.schedule('0 8 * * *', () => {
      backendLogger.info('Running daily trend log report job.', 'PeriodicReportService');
      this.sendDailyReport();
    }, {
      timezone: "Europe/Istanbul" // Or your desired timezone
    });
  }

  private async sendDailyReport() {
    try {
      const { db } = await connectToDatabase();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Fetch trend log entries from the last 24 hours
      const trendLogs = await db.collection('trend_log_entries').find({
        timestamp: { $gte: twentyFourHoursAgo }
      }).sort({ timestamp: 1 }).toArray();

      if (trendLogs.length === 0) {
        backendLogger.info('No new trend logs in the last 24 hours. Skipping report.', 'PeriodicReportService');
        return;
      }

      // Generate a simple report
      const reportSubject = `Daily Trend Log Report - ${new Date().toLocaleDateString()}`;
      let reportText = 'The following trend log entries were recorded in the last 24 hours:\n\n';
      let reportHtml = `
        <h1>Daily Trend Log Report</h1>
        <p>Date: ${new Date().toLocaleDateString()}</p>
        <table border="1" cellpadding="5" cellspacing="0">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Register ID</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const log of trendLogs) {
        const timestamp = new Date(log.timestamp).toLocaleString();
        reportText += `${timestamp} - Register: ${log.registerId}, Value: ${log.value}\n`;
        reportHtml += `
          <tr>
            <td>${timestamp}</td>
            <td>${log.registerId}</td>
            <td>${log.value}</td>
          </tr>
        `;
      }
      
      reportHtml += `</tbody></table>`;
      
      const success = await mailService.sendMail(reportSubject, reportText, reportHtml);
      if (success) {
        backendLogger.info('Daily trend log report sent successfully.', 'PeriodicReportService');
      } else {
        backendLogger.error('Failed to send daily trend log report.', 'PeriodicReportService');
      }

    } catch (error) {
      backendLogger.error('An error occurred while generating the daily report.', 'PeriodicReportService', { 
        error: (error as Error).message,
        stack: (error as Error).stack 
      });
    }
  }
}

// Initialize the service
export const periodicReportService = new PeriodicReportService();