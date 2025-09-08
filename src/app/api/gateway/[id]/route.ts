import { authOptions } from '@/lib/auth-options';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

// Kullanıcı güncelleme
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;

    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { name, connectionType, ipAddress, port, baudRate, parity, stopBits } = await request.json();
    console.log(name, connectionType, ipAddress, port, baudRate, parity, stopBits);

    if (connectionType === 'serial') {
      if (!port || !baudRate || !parity || !stopBits) {
        return NextResponse.json({ error: 'Port, baud rate, parity, and stop bits are required' }, { status: 400 });
      }
    }
    if (connectionType === 'tcp') {
      if (!ipAddress) {
        return NextResponse.json({ error: 'IP address is required' }, { status: 400 });
      }
    }
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Kullanıcı adının benzersiz olup olmadığını kontrol et (kendi ID'si hariç)
    const existingGateway = await db.collection('gateway').findOne({
      name,
      _id: { $ne: new ObjectId(id) }
    });

    if (existingGateway) {
      return NextResponse.json({ error: 'gateway with the same name already exists' }, { status: 400 });
    }

    // Güncellenecek alanları hazırla
    const updateData: any = {
      name,
      connectionType,
      ipAddress,
      port,
      baudRate,
      parity,
      stopBits,
      createdAt: new Date()
    };

    const result = await db.collection('gateway').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'gateway not found' }, { status: 404 });
    }


    const analyzers = await db.collection('analyzers').find({ gateway: id }).toArray();
    const analyzerIds = analyzers.map(analyzer => analyzer._id.toString());

    const registers: any[] = [];
    let registerNodes: any[] = [];
    //find registers belongs to this analyzer from buildings flow data
    const buildings = await db.collection('buildings').find({}).toArray();

    for (const building of buildings) {
      if (building.flowData && building.flowData.nodes) {
        registerNodes = building.flowData.nodes.filter((node: any) => {
          return analyzerIds.includes(node.data.analyzerId);
        });
      }
      if (building.floors && building.floors.length > 0) {
        for (const floor of building.floors) {
          if (floor.flowData && floor.flowData.nodes) {
            registerNodes = registerNodes.concat(floor.flowData.nodes.filter((node: any) => {
              return analyzerIds.includes(node.data.analyzerId);
            }));
          }
          if (floor.rooms && floor.rooms.length > 0) {
            for (const room of floor.rooms) {
              if (room.flowData && room.flowData.nodes) {
                registerNodes = registerNodes.concat(room.flowData.nodes.filter((node: any) => {
                  return analyzerIds.includes(node.data.analyzerId);
                }));
              }
            }
          }
        }
      }
    }

    for (const node of registerNodes) {
      const analyzer = analyzers.find((analyzer: any) => analyzer._id.toString() === node.data.analyzerId);
      const gateway = await db.collection('gateway').findOne({ _id: new ObjectId(analyzer!.gateway) });
      registers.push({
        ...node.data,
        analyzer,
        gateway: gateway,
        updated: true
      });
    }

    if (registers.length > 0) {
      await db.collection("registers").insertMany(registers);
    }


    return NextResponse.json({ success: true, message: 'gateway updated successfully' });
  } catch (error) {
    console.error('gateway update failed:', error);
    return NextResponse.json({ error: 'gateway update failed' }, { status: 500 });
  }
}

// gateway silme
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;

    const session = await getServerSession(authOptions);
    // Yetki kontrolü
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    // Debug logları
    console.log('Session user ID:', session?.user?.id, 'Type:', typeof session?.user?.id);
    console.log('Request ID to delete:', id, 'Type:', typeof id);

    // gateway'yu silmesini engelle
    // gateway bilgisini veritabanından alalım
    const gatewayToDelete = await db.collection('gateway').findOne({ _id: new ObjectId(id) });
    console.log('gateway to delete:', gatewayToDelete);

    //is gateway exist
    if (!gatewayToDelete) {
      return NextResponse.json({ error: 'gateway not found' }, { status: 404 });
    }
  

 
    //delete analyzers which is connected to this gateway
    const analyzers = await db.collection('analyzers').find({ gateway: id }).toArray();
    const analyzerIds = analyzers.map(analyzer => analyzer._id.toString());

    console.log('Analyzers to delete:', analyzers);
    console.log('Analyzer IDs:', analyzerIds);


    const buildings = await db.collection('buildings').find({}).toArray();
    let registerNodes: any[] = [];
    for (const building of buildings) {
      let updated = false;

      // Bina seviyesindeki flowData.nodes'ları kontrol et
      if (building.flowData && Array.isArray(building.flowData.nodes)) {
        const originalNodesCount = building.flowData.nodes.length;
        registerNodes = registerNodes.concat(building.flowData.nodes.filter((node: any) => {
          return node.type == "registerNode" && analyzerIds.includes(node.data.analyzerId);
        }));
        building.flowData.nodes = building.flowData.nodes.filter((node: any) => {
          // Register node'u değilse veya analyzerId yoksa tut
          if (node.type != "registerNode" || !node.data || !node.data.analyzerId) {
            return true;
          }

          // Silinecek analyzer'lardan birine ait değilse tut
          return !analyzerIds.includes(node.data.analyzerId);
        });

        // Eğer node sayısı değiştiyse güncelleme yap
        if (originalNodesCount !== building.flowData.nodes.length) {
          updated = true;
        }
      }

      // Her katın flowData.nodes'larını kontrol et
      if (Array.isArray(building.floors)) {
        for (const floor of building.floors) {
          if (floor.flowData && Array.isArray(floor.flowData.nodes)) {
            const originalFloorNodesCount = floor.flowData.nodes.length;
            registerNodes = registerNodes.concat(floor.flowData.nodes.filter((node: any) => {
              return node.type == "registerNode" && analyzerIds.includes(node.data.analyzerId);
            }));
            floor.flowData.nodes = floor.flowData.nodes.filter((node: any) => {
              if (node.type != "registerNode" || !node.data || !node.data.analyzerId) {
                return true;
              }
              return !analyzerIds.includes(node.data.analyzerId);
            });

            if (originalFloorNodesCount !== floor.flowData.nodes.length) {
              updated = true;
            }
          }

          // Her odanın flowData.nodes'larını kontrol et
          if (Array.isArray(floor.rooms)) {
            for (const room of floor.rooms) {
              if (room.flowData && Array.isArray(room.flowData.nodes)) {
                const originalRoomNodesCount = room.flowData.nodes.length;
                registerNodes = registerNodes.concat(room.flowData.nodes.filter((node: any) => {
                  return node.type == "registerNode" && analyzerIds.includes(node.data.analyzerId);
                }));
                room.flowData.nodes = room.flowData.nodes.filter((node: any) => {
                  if (node.type != "registerNode" || !node.data || !node.data.analyzerId) {
                    return true;
                  }
                  return !analyzerIds.includes(node.data.analyzerId);
                });

                if (originalRoomNodesCount !== room.flowData.nodes.length) {
                  updated = true;
                }
              }
            }
          }
        }
      }
      console.log("register nodes: ", registerNodes)
      // Değişiklik varsa veritabanını güncelle
      if (updated) {
        const registers: any[] = [];
        for (const node of registerNodes) {
          const analyzer = analyzers.find((analyzer: any) => analyzer._id.toString() === node.data.analyzerId);
          const gateway = gatewayToDelete;
          registers.push({
            ...node.data,
            nodeId: node.id,
            analyzer,
            gateway: gateway,
            deleted: true
          });
        }
        console.log("registers to delete", registers);
        if (registers.length > 0) {
          await db.collection("registers").insertMany(registers);
        }

        await db.collection('buildings').updateOne(
          { _id: building._id },
          { $set: { flowData: building.flowData, updatedAt: new Date() } }
        );
        console.log(`Building ${building.name} updated - removed register nodes for deleted analyzers`);
      }
    }
    await db.collection('analyzers').deleteMany({ gateway: id });
    const result = await db.collection('gateway').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'gateway not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'gateway deleted successfully' });
  } catch (error) {
    console.error('gateway deletion failed:', error);
    return NextResponse.json({ error: 'gateway deletion failed' }, { status: 500 });
  }
}
