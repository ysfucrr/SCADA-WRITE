import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için widgets endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // Widget'ları getir
    const widgets = await db.collection('widgets').find({}).toArray();
    
    console.log(`Found ${widgets.length} widgets`);
    
    // Widget'ları formatla ve sadece register item'larını al (text item'larını filtrele)
    const formattedWidgets = widgets.map(widget => {
      // Sadece analyzerId ve address olan item'ları al (gerçek register'lar)
      // Text item'larında bu alanlar yok
      const filteredRegisters = (widget.registers || []).filter((item: any) =>
        item.analyzerId && (item.address !== undefined && item.address !== null)
      );
      
      return {
        _id: widget._id.toString(),
        title: widget.title,
        size: widget.size,
        position: widget.position || { x: 0, y: 0 },
        appearance: widget.appearance,
        registers: filteredRegisters,
        valuePositions: widget.valuePositions || {},
        labelPositions: widget.labelPositions || {},
        valueSizes: widget.valueSizes || {},
        labelSizes: widget.labelSizes || {},
        createdAt: widget.createdAt ? new Date(widget.createdAt).toISOString() : null,
        updatedAt: widget.updatedAt ? new Date(widget.updatedAt).toISOString() : null
      };
    });

    return NextResponse.json({
      success: true,
      total: formattedWidgets.length,
      widgets: formattedWidgets
    });
    
  } catch (error) {
    console.error('Mobile widgets could not be fetched:', error);
    return NextResponse.json({ 
      error: 'Widgets could not be fetched',
      success: false,
      widgets: [],
      total: 0
    }, { status: 500 });
  }
}