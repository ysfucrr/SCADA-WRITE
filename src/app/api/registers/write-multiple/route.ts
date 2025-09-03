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
    const { analyzerId, address, values } = body;

    // Validation
    if (!analyzerId || address === undefined || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: analyzerId, address, values (array)" },
        { status: 400 }
      );
    }

    // Values validation
    const processedValues: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const val = Number(values[i]);
      if (isNaN(val)) {
        return NextResponse.json(
          { error: `Invalid numeric value at index ${i}: ${values[i]}` },
          { status: 400 }
        );
      }
      processedValues.push(val);
    }

    backendLogger.info(`Write multiple request received: Analyzer=${analyzerId}, Address=${address}, Values=[${processedValues.join(',')}]`, "WriteMultipleAPI");

    // ModbusPoller üzerinden write multiple işlemi yap
    try {
      await modbusPoller.writeMultipleRegisters(analyzerId, address, processedValues);
      
      const writeResult = {
        success: true,
        analyzerId,
        address,
        values: processedValues,
        count: processedValues.length,
        timestamp: new Date().toISOString()
      };

      backendLogger.info(`Write multiple operation completed: ${JSON.stringify(writeResult)}`, "WriteMultipleAPI");

      return NextResponse.json({
        success: true,
        message: "Write multiple operation completed successfully",
        data: writeResult
      });

    } catch (writeError) {
      const errorMessage = writeError instanceof Error ? writeError.message : 'Write multiple operation failed';
      backendLogger.error(`Write multiple operation failed: ${errorMessage}`, "WriteMultipleAPI", { analyzerId, address, values: processedValues });
      
      return NextResponse.json(
        { error: "Write multiple operation failed", details: errorMessage },
        { status: 500 }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    backendLogger.error(`Write multiple API error: ${errorMessage}`, "WriteMultipleAPI", { error: errorMessage });
    
    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}