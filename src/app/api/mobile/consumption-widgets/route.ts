import { connectToDatabase } from '@/lib/mongodb';
import { NextResponse } from 'next/server';

// Mobile uygulama için tüketim widget'larını döner
export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const widgets = await db.collection('consumption').find({}).toArray();

    const formattedWidgets = widgets.map(widget => ({
      _id: widget._id?.toString(),
      title: widget.title || 'Energy Meter',
      trendLogId: widget.trendLogId ? widget.trendLogId.toString() : null,
      size: widget.size || null,
      appearance: widget.appearance || null,
      createdAt: widget.createdAt ? new Date(widget.createdAt).toISOString() : null,
      updatedAt: widget.updatedAt ? new Date(widget.updatedAt).toISOString() : null,
    }));

    return NextResponse.json({
      success: true,
      total: formattedWidgets.length,
      widgets: formattedWidgets,
    });
  } catch (error) {
    console.error('Mobile consumption widgets fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        widgets: [],
        total: 0,
        error: 'Consumption widgets could not be fetched',
      },
      { status: 500 },
    );
  }
}
