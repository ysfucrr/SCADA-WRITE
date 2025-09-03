import { NextResponse } from 'next/server';
import { mailService } from '@/lib/mail-service';
import { backendLogger } from '@/lib/logger/BackendLogger';

export async function POST() {
  try {
    const subject = 'Test Email: Connection Successful!';
    const text = 'This is a test email from your SCADA system to confirm that mail settings are configured correctly.';
    const html = `
      <h1>Connection Successful!</h1>
      <p>This is a test email from your SCADA system.</p>
      <p>If you received this, your mail settings are configured correctly.</p>
    `;

    // We need to ensure settings are loaded before sending.
    // The mailService constructor already loads them, but a reload might be good practice
    // if settings can change frequently without restarting the service.
    // For now, we rely on the initial load.
    
    const success = await mailService.sendMail(subject, text, html);

    if (success) {
      return NextResponse.json({ message: 'Test email sent successfully!' });
    } else {
      return NextResponse.json({ error: 'Failed to send test email. Check service logs for details.' }, { status: 500 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error('Failed to send test email', 'API/mail-settings/test', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to send test email.' }, { status: 500 });
  }
}