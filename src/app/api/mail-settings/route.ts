import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { MailSettings } from '@/types/mail-settings';
import { mailService } from '@/lib/mail-service';
import { backendLogger } from '@/lib/logger/BackendLogger';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const settings = await db.collection('mail_settings').findOne({});
    return NextResponse.json(settings || {});
  } catch (error) {
    backendLogger.error('Failed to fetch mail settings', 'API/mail-settings', { error });
    return NextResponse.json({ error: 'Failed to fetch mail settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const settings: MailSettings = await request.json();
    const { db } = await connectToDatabase();

    await db.collection('mail_settings').updateOne(
      {},
      { $set: settings },
      { upsert: true }
    );
    
    // Trigger a reload of the mail service settings
    await mailService.reloadSettings();

    return NextResponse.json({ message: 'Mail settings updated successfully' });
  } catch (error) {
    backendLogger.error('Failed to update mail settings', 'API/mail-settings', { error });
    return NextResponse.json({ error: 'Failed to update mail settings' }, { status: 500 });
  }
}