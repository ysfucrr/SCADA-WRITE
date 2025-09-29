import { writeFile, mkdir, unlink } from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const UPLOADS_DIR = path.join(process.cwd(), 'public/uploads');

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
  }

  const data = await request.formData();
  const file = (data as any).get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const filename = `${Date.now()}-${file.name.replace(/\s/g, "-")}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
      console.log(`Created uploads directory: ${UPLOADS_DIR}`);
    }

    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      filePath: `/api/image/${filename}` // Bu, client'ın erişeceği URL olacak
    });
  } catch (error) {
    console.error("Error saving file:", error);
    return NextResponse.json(
      { error: 'Error saving file' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
  }

  try {
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    const filename = filePath.replace('/api/image/', '');
    const fullPath = path.join(UPLOADS_DIR, filename);

    if (fs.existsSync(fullPath)) {
      await unlink(fullPath);
      console.log(`Deleted file: ${fullPath}`);
      return NextResponse.json({ success: true, message: 'File deleted successfully' });
    } else {
      console.log(`File not found: ${fullPath}`);
      return NextResponse.json({ success: true, message: 'File not found (already deleted)' });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Error deleting file' },
      { status: 500 }
    );
  }
}