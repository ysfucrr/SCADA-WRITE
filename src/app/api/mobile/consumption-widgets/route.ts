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

    // Trend log entries ve billing gibi compression bilgisi ekle
    const originalFormatSize = JSON.stringify(formattedWidgets).length;
    
    // Compact format - gereksiz alanları kaldır veya optimize et
    const compactWidgets = formattedWidgets.map(widget => ({
      _id: widget._id,
      t: widget.title, // title -> t
      tlid: widget.trendLogId, // trendLogId -> tlid
      s: widget.size, // size -> s
      a: widget.appearance, // appearance -> a
      ct: widget.createdAt ? new Date(widget.createdAt).getTime() : null, // createdAt -> ct (timestamp)
      ut: widget.updatedAt ? new Date(widget.updatedAt).getTime() : null // updatedAt -> ut (timestamp)
    }));
    
    const compactFormatSize = JSON.stringify(compactWidgets).length;
    const compressionRatio = ((1 - compactFormatSize / originalFormatSize) * 100).toFixed(2);
    
    console.log(`[CONSUMPTION-WIDGET] Found ${formattedWidgets.length} widgets`);
    console.log(`[CONSUMPTION-WIDGET] Original format size: ${(originalFormatSize / 1024).toFixed(2)} KB`);
    console.log(`[CONSUMPTION-WIDGET] Compact format size: ${(compactFormatSize / 1024).toFixed(2)} KB`);
    console.log(`[CONSUMPTION-WIDGET] Data format compression: ${compressionRatio}%`);
    
    // Compact format kullan (trend log entries ve billing gibi)
    return NextResponse.json({
      success: true,
      total: compactWidgets.length,
      widgets: compactWidgets,
      dataFormat: "compact" // Mobil uygulamanın bu formatı tanıması için
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
