import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Mobile app için register listesi endpoint'i
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    // Önce tüm analyzer'ları getir (ID -> Name mapping için)
    const analyzers = await db.collection('analyzers').find({}).toArray();
    const analyzerMap = new Map();
    analyzers.forEach(analyzer => {
      analyzerMap.set(analyzer._id.toString(), analyzer.name);
    });
    
    console.log(`Found ${analyzers.length} analyzers`);
    
    // Tüm building'leri getir
    const buildings = await db.collection('buildings').find({}).toArray();
    
    console.log(`Found ${buildings.length} buildings`);
    
    // Tüm register'ları topla
    const allRegisters: any[] = [];
    
    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes && Array.isArray(building.flowData.nodes)) {
        console.log(`Building ${building.name}: ${building.flowData.nodes.length} nodes`);
        
        // Sadece registerNode tipindeki node'ları filtrele
        const registerNodes = building.flowData.nodes.filter((node: any) => 
          node.type === 'registerNode' && node.data
        );
        
        console.log(`Building ${building.name}: ${registerNodes.length} register nodes`);
        
        registerNodes.forEach((node: any) => {
          const analyzerId = node.data.analyzerId;
          const analyzerName = analyzerMap.get(analyzerId) || `Unknown Analyzer (${analyzerId})`;
          
          const register = {
            _id: node.id,
            name: node.data.label || `Register ${node.data.address}`,
            buildingId: building._id.toString(),
            buildingName: building.name,
            analyzerId: analyzerId,
            analyzerName: analyzerName, // Analyzer ismini ekle
            address: node.data.address,
            dataType: node.data.dataType,
            scale: node.data.scale || 1,
            scaleUnit: node.data.scaleUnit || '',
            byteOrder: node.data.byteOrder,
            unit: node.data.scaleUnit || '',
            description: `${building.name} - ${node.data.label}`,
            registerType: node.data.registerType || 'read',
            offset: node.data.offset || 0,
            displayMode: node.data.displayMode || 'digit',
            fontFamily: node.data.fontFamily,
            textColor: node.data.textColor,
            backgroundColor: node.data.backgroundColor,
            opacity: node.data.opacity,
            status: 'active', // Building'de varsa aktif kabul et
            position: node.position,
            style: node.style
          };
          
          allRegisters.push(register);
        });
      }
    }
    
    console.log(`Total registers found: ${allRegisters.length}`);
    
    // Register'ları analyzer ID'ye göre grupla (isteğe bağlı)
    const groupedByAnalyzer = allRegisters.reduce((acc: any, register: any) => {
      const analyzerId = register.analyzerId;
      if (!acc[analyzerId]) {
        acc[analyzerId] = [];
      }
      acc[analyzerId].push(register);
      return acc;
    }, {});
    
    console.log(`Registers grouped by analyzer:`, Object.keys(groupedByAnalyzer).map(id => `${id}: ${groupedByAnalyzer[id].length} registers`));

    return NextResponse.json({
      success: true,
      total: allRegisters.length,
      registers: allRegisters,
      groupedByAnalyzer: groupedByAnalyzer,
      buildingsProcessed: buildings.length
    });
    
  } catch (error) {
    console.error('Mobile registers could not be fetched:', error);
    return NextResponse.json({ 
      error: 'Registers could not be fetched',
      success: false,
      registers: [],
      total: 0
    }, { status: 500 });
  }
}