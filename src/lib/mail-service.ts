import nodemailer from 'nodemailer';
import { connectToDatabase } from './mongodb';
import { MailSettings } from '@/types/mail-settings';
import { backendLogger } from './logger/BackendLogger';

class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private settings: MailSettings | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    try {
      const { db } = await connectToDatabase();
      const settings = await db.collection('mail_settings').findOne<MailSettings>({});
      
      if (settings) {
        this.settings = settings;
        const transportOptions = {
          host: this.settings.host,
          port: this.settings.port,
          secure: this.settings.secure, // Use the 'secure' setting directly from the database
          auth: {
            user: this.settings.auth.user,
            pass: this.settings.auth.pass,
          },
          tls: {
            rejectUnauthorized: false
          }
        };
        this.transporter = nodemailer.createTransport(transportOptions);
        backendLogger.info('Mail settings loaded and transporter configured.', 'MailService', { options: transportOptions });
      } else {
        this.transporter = null;
        this.settings = null;
      }
    } catch (error) {
      backendLogger.error('Failed to load mail settings.', 'MailService', { error: (error as Error).message });
      this.transporter = null;
      this.settings = null;
    }
  }

  public async reloadSettings(): Promise<void> {
    this.initializationPromise = this.loadSettings();
    await this.initializationPromise;
  }

  public async sendMail(subject: string, text: string, html?: string, retryCount = 3): Promise<boolean> {
    // Wait for the initial settings to be loaded to prevent race conditions.
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    // Use the class-level transporter which is configured on load/reload.
    if (!this.transporter || !this.settings) {
      backendLogger.warning('Mail could not be sent. Transporter or settings are not configured.', 'MailService');
      return false;
    }

    const mailOptions = {
      from: `"${this.settings.from}" <${this.settings.auth.user}>`,
      to: this.settings.to, // Use loaded settings
      subject,
      text,
      html,
    };

    for (let i = 0; i < retryCount; i++) {
      try {
        await this.transporter.sendMail(mailOptions);
        // Use the correct settings object for logging
        backendLogger.info(`Mail sent to ${this.settings.to} with subject: ${subject}`, 'MailService');
        return true;
      } catch (error) {
        const err = error as Error;
        backendLogger.error(`Attempt ${i + 1} to send mail failed.`, 'MailService', {
          error: err.message,
          stack: err.stack,
        });
        if (i < retryCount - 1) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          return false;
        }
      }
    }
    return false;
  }
}

export const mailService = new MailService();