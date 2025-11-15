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
    
    // Tüm building'leri getir - tam veri yapısı görmek için findOne ile birini incele
    const sampleBuilding = await db.collection('buildings').findOne({});
    
    // Örnek bina yapısını çıkarırken null check ekleyelim
    let buildingStructure: any = { message: 'No sample building found' };
    
    if (sampleBuilding) {
      buildingStructure = {
        _id: sampleBuilding._id,
        name: sampleBuilding.name,
        hasFloors: !!sampleBuilding.floors,
        floorsLength: sampleBuilding.floors ? sampleBuilding.floors.length : 0
      };
      
      // Floors varsa örnek bir floor ekleyelim
      if (sampleBuilding.floors && sampleBuilding.floors.length > 0) {
        const sampleFloor = sampleBuilding.floors[0];
        buildingStructure.sampleFloor = {
          name: sampleFloor.name,
          hasRooms: !!sampleFloor.rooms,
          roomsLength: sampleFloor.rooms ? sampleFloor.rooms.length : 0
        };
        
        // Rooms varsa örnek bir room ekleyelim
        if (sampleFloor.rooms && sampleFloor.rooms.length > 0) {
          const sampleRoom = sampleFloor.rooms[0];
          buildingStructure.sampleFloor.sampleRoom = {
            name: sampleRoom.name,
            hasFlowData: !!sampleRoom.flowData,
            nodesLength: sampleRoom.flowData?.nodes?.length || 0,
            flowDataStructure: sampleRoom.flowData ? Object.keys(sampleRoom.flowData) : []
          };
          
          // Nodes varsa bir örnek node yapısını da inceleyelim
          if (sampleRoom.flowData?.nodes && sampleRoom.flowData.nodes.length > 0) {
            const sampleNode = sampleRoom.flowData.nodes[0];
            buildingStructure.sampleFloor.sampleRoom.sampleNode = {
              type: sampleNode.type,
              hasData: !!sampleNode.data,
              dataFields: sampleNode.data ? Object.keys(sampleNode.data) : []
            };
          }
        }
      }
    }
    console.log('Building structure debug:', JSON.stringify(buildingStructure, null, 2));
    
    const buildings = await db.collection('buildings').find({}).toArray();
    console.log(`Found ${buildings.length} buildings`);
    
    // Tüm register'ları topla
    const allRegisters: any[] = [];
    
    for (const building of buildings) {
      // Önce binanın kendi flowData'sını kontrol et
      if (building.flowData && building.flowData.nodes && Array.isArray(building.flowData.nodes)) {
        console.log(`Building ${building.name}: Root level has ${building.flowData.nodes.length} nodes`);
        
        // Sadece registerNode tipindeki node'ları filtrele
        const registerNodes = building.flowData.nodes.filter((node: any) =>
          node.type === 'registerNode' && node.data
        );
        
        console.log(`Building ${building.name}: Root level has ${registerNodes.length} register nodes`);
        
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
            bit: node.data.bit, // Boolean register'lar için bit pozisyonu
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
            style: node.style,
            controlType: node.data.controlType,
            dropdownOptions: node.data.dropdownOptions,
            onValue: node.data.onValue,
            offValue: node.data.offValue
          };
          
          allRegisters.push(register);
        });
      }
      
      // Şimdi Floors -> Rooms altındaki flowData'ları kontrol et
      if (building.floors && Array.isArray(building.floors)) {
        console.log(`Building "${building.name}" (id: ${building._id}) has ${building.floors.length} floors`);
        
        // Veri yapısını yazdıralım
        console.log('FULL FLOORS STRUCTURE:', JSON.stringify(building.floors.map(f => ({
          name: f.name,
          _id: f._id,
          hasRooms: !!f.rooms,
          roomsLength: f.rooms?.length || 0,
          hasFlowData: !!f.flowData
        })), null, 2));
        
        for (const floor of building.floors) {
          console.log(`  Floor "${floor.name || 'Unnamed floor'}" (id: ${floor._id}) has rooms: ${floor.rooms && Array.isArray(floor.rooms) ? floor.rooms.length : 'No rooms'}`);
          
          // Floor'un doğrudan kendisinde flowData olabilir
          if (floor.flowData && floor.flowData.nodes && Array.isArray(floor.flowData.nodes)) {
            console.log(`  Floor "${floor.name}" has its own flowData with ${floor.flowData.nodes.length} nodes`);
            
            const floorRegisterNodes = floor.flowData.nodes.filter((node: any) =>
              node.type === 'registerNode' && node.data && node.data.analyzerId
            );
            
            if (floorRegisterNodes.length > 0) {
              console.log(`  Found ${floorRegisterNodes.length} register nodes directly in floor`);
              
              floorRegisterNodes.forEach((node: any) => {
                const analyzerId = node.data.analyzerId;
                const analyzerName = analyzerMap.get(analyzerId) || `Unknown Analyzer (${analyzerId})`;
                
                const register = {
                  _id: node.id,
                  name: node.data.label || `Register ${node.data.address}`,
                  buildingId: building._id.toString(),
                  buildingName: building.name,
                  floorName: floor.name || 'Unknown Floor',
                  analyzerId: analyzerId,
                  analyzerName: analyzerName,
                  address: node.data.address,
                  dataType: node.data.dataType,
                  bit: node.data.bit, // Boolean register'lar için bit pozisyonu
                  scale: node.data.scale || 1,
                  scaleUnit: node.data.scaleUnit || '',
                  byteOrder: node.data.byteOrder,
                  unit: node.data.scaleUnit || '',
                  description: `${building.name} - ${floor.name || 'Floor'} - ${node.data.label}`,
                  registerType: node.data.registerType || 'read',
                  offset: node.data.offset || 0,
                  displayMode: node.data.displayMode || 'digit',
                  fontFamily: node.data.fontFamily,
                  textColor: node.data.textColor,
                  backgroundColor: node.data.backgroundColor,
                  opacity: node.data.opacity,
                  status: 'active',
                  position: node.position,
                  style: node.style,
                  controlType: node.data.controlType,
                  dropdownOptions: node.data.dropdownOptions
                };
                
                allRegisters.push(register);
                console.log(`    Added register ${node.id} from floor ${floor.name}`);
              });
            }
          }
          
          // Normal yol: Floor içindeki Room'ları kontrol et
          if (floor.rooms && Array.isArray(floor.rooms)) {
            for (const room of floor.rooms) {
              console.log(`    Room "${room.name || 'Unnamed room'}" has flowData: ${room.flowData ? 'Yes' : 'No'}, nodes: ${room.flowData?.nodes?.length || 0}`);
              
              // Eğer flowData doğrudan roomun altında değilse, özel bir hata mesajı ekleyelim
              if (!room.flowData && typeof room === 'object') {
                console.log(`    Room keys: ${Object.keys(room).join(', ')}`);
                
                // Room içeriğini detaylı olarak görmek için
                console.log(`    Room content debug:`, JSON.stringify(room, null, 2).substring(0, 500) + '...');
              }
              
              if (room.flowData && room.flowData.nodes && Array.isArray(room.flowData.nodes)) {
                console.log(`Building ${building.name}: Room ${room.name || 'unnamed'} has ${room.flowData.nodes.length} nodes`);
                
                // Node yapısını incelemek için bir örnek node alalım
                const sampleNode = room.flowData.nodes[0];
                if (sampleNode) {
                  console.log(`    Sample node type: ${sampleNode.type}, has data: ${!!sampleNode.data}`);
                  if (sampleNode.data) {
                    console.log(`    Sample node data keys: ${Object.keys(sampleNode.data).join(', ')}`);
                    console.log(`    Sample node data:`, JSON.stringify(sampleNode.data, null, 2).substring(0, 300));
                  }
                }
                
                // Sadece registerNode tipindeki node'ları filtrele
                const roomRegisterNodes = room.flowData.nodes.filter((node: any) => {
                  // Debug için daha detaylı kontrol
                  if (node.type !== 'registerNode') {
                    return false;
                  }
                  
                  if (!node.data) {
                    console.log(`    Found registerNode without data!`);
                    return false;
                  }
                  
                  // AnalyzerId kontrolü ekleyelim
                  if (!node.data.analyzerId) {
                    console.log(`    RegisterNode without analyzerId! Node ID: ${node.id}`);
                    return false;
                  }
                  
                  return true;
                });
                
                console.log(`    Building ${building.name}: Room ${room.name || 'unnamed'} has ${roomRegisterNodes.length} valid register nodes`);
                
                // Kaç register eklendiğini sayalım
                let addedRegisters = 0;
                roomRegisterNodes.forEach((node: any) => {
                  const analyzerId = node.data.analyzerId;
                  const analyzerName = analyzerMap.get(analyzerId) || `Unknown Analyzer (${analyzerId})`;
                  
                  const register = {
                    _id: node.id,
                    name: node.data.label || `Register ${node.data.address}`,
                    buildingId: building._id.toString(),
                    buildingName: building.name,
                    floorName: floor.name || 'Unknown Floor',
                    roomName: room.name || 'Unknown Room',
                    analyzerId: analyzerId,
                    analyzerName: analyzerName,
                    address: node.data.address,
                    dataType: node.data.dataType,
                    bit: node.data.bit, // Boolean register'lar için bit pozisyonu
                    scale: node.data.scale || 1,
                    scaleUnit: node.data.scaleUnit || '',
                    byteOrder: node.data.byteOrder,
                    unit: node.data.scaleUnit || '',
                    description: `${building.name} - ${floor.name || 'Floor'} - ${room.name || 'Room'} - ${node.data.label}`,
                    registerType: node.data.registerType || 'read',
                    offset: node.data.offset || 0,
                    displayMode: node.data.displayMode || 'digit',
                    fontFamily: node.data.fontFamily,
                    textColor: node.data.textColor,
                    backgroundColor: node.data.backgroundColor,
                    opacity: node.data.opacity,
                    status: 'active',
                    position: node.position,
                    style: node.style,
                    controlType: node.data.controlType,
                    dropdownOptions: node.data.dropdownOptions
                  };
                  
                  allRegisters.push(register);
                  addedRegisters++;
                });
                console.log(`    Added ${addedRegisters} registers from room ${room.name || 'unnamed'}`);
              }
            }
          }
        }
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