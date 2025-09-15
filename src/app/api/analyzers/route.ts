import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { existsSync } from 'fs';

// Possible locations of the license file in different environments
function getLicensePath() {
  console.log("Working directory (process.cwd):", process.cwd());
  
  // Check all possible paths
  const possiblePaths = [
    // 1. Development mode (dev)
    path.join(process.cwd(), "license-server", "license.json"),
    
    // 2. Inside packaged app (resources/app/license.json)
    path.join(process.cwd(), "license.json"),
    
    // 3. In the resources folder of packaged app
    path.join(process.cwd(), "..", "license.json"),
    
    // 4. In the main folder of packaged app
    path.join(process.cwd(), "..", "..", "license.json"),
    
    // 5. Specifically in resources/app path
    path.join(process.cwd(), "resources", "app", "license.json")
  ];
  
  // Check each path
  for (const p of possiblePaths) {
    console.log(`Checking license file: ${p}`);
    if (existsSync(p)) {
      console.log(`✅ License file FOUND: ${p}`);
      return p;
    }
  }
  
  // Not found in any path, return the default path in the working directory
  const defaultPath = path.join(process.cwd(), "license.json");
  console.log(`❌ License file not found, using default path: ${defaultPath}`);
  return defaultPath;
}

// Instead of a constant LICENSE_PATH, create a function that returns the path each time it's called
function getCurrentLicensePath() {
  return getLicensePath();
}

// Get all analyzers
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Block access if not admin
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const query = request.nextUrl.searchParams;
    const gateway = query.get('gateway');
    let analyzers;
    if (gateway) {
      analyzers = await db.collection('analyzers').find({ gateway: gateway }).toArray();
    }
    else {
      analyzers = await db.collection('analyzers').find().toArray();
    }

    // Convert ObjectId to string
    const formattedAnalyzers = analyzers.map(analyzers => ({
      ...analyzers,
      _id: analyzers._id.toString(),
      createdAt: analyzers.createdAt ? new Date(analyzers.createdAt).toISOString() : null
    }));

    return NextResponse.json(formattedAnalyzers);
  } catch (error) {
    console.error('Analyzers could not be fetched:', error);
    return NextResponse.json({ error: 'Analyzers could not be fetched' }, { status: 500 });
  }
}

// Add new analyzer
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Authorization check
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    let license;
    try {
      const licensePath = getCurrentLicensePath(); // Her seferinde güncel yolu al
      if (fs.existsSync(licensePath)) {
        license = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
        console.log("License file read:", licensePath);
      } else {
        console.error("License file not found:", licensePath);
        return NextResponse.json({ error: 'License file not found' }, { status: 403 });
      }
    } catch (error) {
      console.error("License file reading error:", error);
      return NextResponse.json({ error: 'Cannot read license file' }, { status: 500 });
    }
    
    const { db } = await connectToDatabase();
    const analyzers = await db.collection('analyzers').find().toArray();
    console.log("analyzers", analyzers.length);
    console.log("license", license?.maxDevices);

    if (!license || analyzers.length >= license.maxDevices) {
      return NextResponse.json({ error: 'License limit exceeded' }, { status: 403 });
    }
    const { name, slaveId, model, poll, timeout, ctRadio, vtRadio, connection, gateway, unit } = await request.json();
    console.log(
      name, slaveId, model, poll, timeout, ctRadio, vtRadio, connection, gateway, unit
    )

    // Check required fields
    const errors = [];

    if (!name) errors.push('Analyzer name is required');
    if (!gateway) errors.push('Gateway selection is required');
    if (!slaveId) errors.push('Slave ID is required');
    if (!model) errors.push('Model is required');
    if (!poll) errors.push('Poll duration is required');
    if (!timeout) errors.push('Timeout duration is required');
    if (!ctRadio) errors.push('CT Radio is required');
    if (!vtRadio) errors.push('VT Radio is required');
    if (!connection) errors.push('Connection type is required');

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    // Check if analyzer name is unique
    const existingAnalyzer = await db.collection('analyzers').findOne({ name });
    if (existingAnalyzer) {
      return NextResponse.json({ error: 'Analyzer with the same name already exists' }, { status: 400 });
    }

    const newAnalyzer = {
      name,
      slaveId,
      model,
      poll,
      timeout,
      ctRadio,
      vtRadio,
      connection,
      gateway,
      unit,
      createdAt: new Date()
    };




    const result = await db.collection('analyzers').insertOne(newAnalyzer);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      ...newAnalyzer,
      createdAt: newAnalyzer.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('Analyzer could not be added:', error);
    return NextResponse.json({ error: 'Analyzer could not be added' }, { status: 500 });
  }
}
