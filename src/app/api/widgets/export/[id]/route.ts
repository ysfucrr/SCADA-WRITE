import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ObjectId } from 'mongodb';
import { format, differenceInDays } from 'date-fns';
export async function GET(request: Request,
  { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== 'admin' && !session.user.permissions?.dashboard)) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { id } = await params;
    const { db } = await connectToDatabase();
    const widget = await db.collection('widgets').findOne({ _id: new ObjectId(id) });

    if (!widget) {
      return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
    }

    const { currency, price, trendLogs: trendLogsInWidget } = widget;
    const reportDate = new Date();

    const tableData = [];
    let usedTotal = 0;
    const updatedTrendLogsForWidget = [];

    // 1. & 2. Process each trend log, calculate consumption, and prepare data
    for (const trendLog of trendLogsInWidget) {
      // Get CURRENT value from the service
      const valueResponse = await fetch(`http://localhost:${process.env.SERVICE_PORT}/express-api/get-register-value?id=${trendLog.registerId}`);
      if (!valueResponse.ok) {
        const errorData = await valueResponse.json();
        throw new Error(`Could not fetch current value for register ${trendLog.registerId}: ${errorData.error}`);
      }
      const valueJson = await valueResponse.json();
      const currentValue = parseFloat(valueJson.value);
      if (isNaN(currentValue)) {
        throw new Error(`Invalid current value received for register ${trendLog.registerId}`);
      }

      const firstValue = trendLog.firstValue || 0;
      const difference = currentValue - firstValue;
      usedTotal += difference;

      const analyzer = await db.collection('analyzers').findOne({ _id: new ObjectId(trendLog.analyzerId) });

      tableData.push([
        `${analyzer?.name || 'N/A'}`,
        `${firstValue.toFixed(2)} kWh`,
        `${currentValue.toFixed(2)} kWh`,
        `${difference.toFixed(2)} kWh`,
        `${(difference * price).toLocaleString('tr-TR')} ${currency}`
      ]);

      updatedTrendLogsForWidget.push({
        ...trendLog,
        firstValue: currentValue
      });
    }

    // 3. Generate PDF
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Energy Consumption Report', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

    autoTable(doc, {
      head: [['LOCATION', 'FIRST VALUE', 'LAST VALUE', 'USED', 'COST']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
      styles: { fontSize: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalCost = (usedTotal * price).toLocaleString('tr-TR');
    const daysDifference = differenceInDays(reportDate, new Date(widget.startTime));

    doc.setFontSize(10);
    doc.text(`Start Date: ${format(new Date(widget.startTime), 'dd.MM.yyyy')}`, 14, finalY);
    doc.text(`Report Date: ${format(reportDate, 'dd.MM.yyyy')}`, 100, finalY);
    doc.text(`Days: ${daysDifference}`, 14, finalY + 5);

    doc.text(`Used Total: ${usedTotal.toFixed(2)} kWh`, 14, finalY + 15);
    doc.text(`Total Cost: ${totalCost} ${currency}`, 100, finalY + 15);

    // Add the disclaimer note in red
    const noteY = finalY + 25;
    doc.setFontSize(8);
    doc.setTextColor(255, 0, 0); // Red color
    const disclaimer = "Ce montant est basé uniquement sur votre consommation d’énergie active.\nLes frais fixes, les pénalités et les taxes seront ajoutés séparément à votre facture par la Senelec.";
    doc.text(disclaimer, 14, noteY);
    doc.setTextColor(0, 0, 0); // Reset color to black
    //create index if not exists
    const indexExists = await db.collection('trend_log_entries').indexExists('exportedAt_1');
    if (!indexExists) {
      await db.collection('trend_log_entries').createIndex(
        { "exportedAt": 1 },
        { expireAfterSeconds: 365 * 24 * 60 * 60 }
      );
    }

    // 4. Update Database and Reset Cycle
    for (const updatedLog of updatedTrendLogsForWidget) {
      // Mark all previous entries for this log as exported
      await db.collection('trend_log_entries').updateMany(
        { trendLogId: new ObjectId(updatedLog.id), exported: { $ne: true } },
        { $set: { exported: true, exportedAt: new Date() } }
      );

      // Insert the new "first value" entry for the next cycle.
      // This is the most critical step for resetting the billing period.
      await db.collection('trend_log_entries').insertOne({
        trendLogId: new ObjectId(updatedLog.id),
        value: updatedLog.firstValue, // This is the `currentValue` from the report, now becoming the new `firstValue`
        timestamp: reportDate,
        analyzerId: updatedLog.analyzerId,
        registerId: updatedLog.registerId,
        exported: false, // Ensure this new entry is part of the next calculation
      });
    }

    // Finally, update the widget itself to reflect the new state
    await db.collection('widgets').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          startTime: reportDate, // Reset the billing start date
          trendLogs: updatedTrendLogsForWidget, // a an array where `firstValue` is now the reset value
        },
      }
    );

    // 5. Return PDF
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="energy-report-${format(reportDate, 'yyyy-MM-dd')}.pdf"`);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Widgets could not be fetched:', error);
    return NextResponse.json({ error: 'Widgets could not be fetched' }, { status: 500 });
  }
}
