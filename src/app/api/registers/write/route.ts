import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { modbusPoller } from '../../../../../service_new';

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { analyzerId, address, value, dataType, byteOrder, bit } = body;

    // Validation
    if (!analyzerId || address === undefined || value === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: analyzerId, address, value" },
        { status: 400 }
      );
    }

    // Value validation based on data type
    let processedValue: number;
    
    if (dataType === 'boolean') {
      // Boolean değerler için 0 veya 1'e dönüştür
      processedValue = value === true || value === 1 || value === '1' || value === 'true' || value === 'on' ? 1 : 0;
    } else {
      // Numeric değerler için number'a dönüştür
      processedValue = Number(value);
      if (isNaN(processedValue)) {
        return NextResponse.json(
          { error: "Invalid numeric value" },
          { status: 400 }
        );
      }
    }

    backendLogger.info(`Write request received: Analyzer=${analyzerId}, Address=${address}, Value=${processedValue}, DataType=${dataType}`, "WriteAPI");

    // ModbusPoller üzerinden write işlemi yap
    try {
      await modbusPoller.writeRegister(analyzerId, address, processedValue);
      
      const writeResult = {
        success: true,
        analyzerId,
        address,
        value: processedValue,
        timestamp: new Date().toISOString(),
        dataType,
        byteOrder,
        bit: dataType === 'boolean' ? bit : undefined
      };

      backendLogger.info(`Write operation completed: ${JSON.stringify(writeResult)}`, "WriteAPI");

      return NextResponse.json({
        success: true,
        message: "Write operation completed successfully",
        data: writeResult
      });

    } catch (writeError) {
      const errorMessage = writeError instanceof Error ? writeError.message : 'Write operation failed';
      backendLogger.error(`Write operation failed: ${errorMessage}`, "WriteAPI", { analyzerId, address, value: processedValue });
      
      return NextResponse.json(
        { error: "Write operation failed", details: errorMessage },
        { status: 500 }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Write API error: ${errorMessage}`, "WriteAPI", { error: errorMessage });
    
    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}