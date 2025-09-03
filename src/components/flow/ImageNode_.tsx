import React, { memo, useEffect, useState } from 'react';
import { NodeProps, NodeToolbar, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';
import { Edit, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Heading3, Paragraph } from '@/components/ui/typography';
import { User } from 'lucide-react';

interface ImageNodeData {
  image?: string;
  opacity?: number;
  navigationUrl?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ImageNode = memo((node: NodeProps<ImageNodeData>) => {
  console.log("node:", node);
  const router = useRouter();
  const { navigationUrl } = node.data;
  const [buildings, setBuildings] = useState<any[]>([]);
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  if (isAuthLoading) {
      return <Spinner variant="bars" fullPage />
  } 


  const fetchBuildings = async () => {
    try {
      const response = await fetch('/api/units');
      const data = await response.json();
      setBuildings(data.buildings);
    } catch (error) {
      console.error('Error fetching buildings:', error);
    }
  };


  useEffect(() => {
    fetchBuildings();
  }, []);

  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: node.selected ? '6px solid #f00' : 'none',
    borderRadius: '5px',
    padding: '0',
    position: 'relative',
    minWidth: "64px",
    minHeight: "64px",
    overflow: 'hidden',
    cursor: navigationUrl ? 'pointer' : 'default'
  };

  const getSelectedItemName = (unit: string) => {
    if (!unit) return "Select Navigation Target (optional)";

    // URL'den ID'leri ayıkla
    const parts = unit.split('/').filter(p => p);

    if (parts.length === 0) return "Select Navigation Target (optional)";

    // Bina ID'si
    const buildingId = parts[0];
    const building = buildings.find(b => b._id === buildingId || b.id === buildingId);

    if (!building) return "Select Navigation Target (optional)";

    // Sadece bina seçilmişse
    if (parts.length === 1) return building.name;

    // Kat ID'si
    const floorId = parts[1];
    const floor = building.floors.find((f: any) => f._id === floorId || f.id === floorId);

    if (!floor) return building.name;

    // Sadece kat seçilmişse
    if (parts.length === 2) return `${building.name} > ${floor.name}`;

    // Oda ID'si
    const roomId = parts[2];
    const room = floor.rooms.find((r: any) => r._id === roomId || r.id === roomId);

    if (!room) return `${building.name} > ${floor.name}`;

    return `${building.name} > ${floor.name} > ${room.name}`;
  };

  // Navigasyon işlevi
  const handleNodeClick = async (e: React.MouseEvent) => {
    if (isAdmin) {
      return
    }
    if (navigationUrl) {
      router.push(`/units/${navigationUrl}`);
    }
    // console.log("node clicked", navigationUrl);
    // if (navigationUrl) {
    //   e.stopPropagation(); // React Flow'un olay yönetimini engelle
    //   console.log("router pushing", navigationUrl);
    //   const result = await showConfirmAlert(
    //     "Navigate to unit?",
    //     `This node has navigation to ${getSelectedItemName(navigationUrl)}.
    //     Are you sure you want to navigate to this unit?`,
    //     "Yes",
    //     "Cancel",
    //   );
    //   if (result.isConfirmed) {
    //     router.push(`/units/${navigationUrl}`);
    //   }
    // }
  };

  // Arkaplan rengi her zaman uygulanır
  // Resim ayrı bir element olarak eklenecek


  return (
    <>
      <NodeToolbar isVisible={node.selected} position={Position.Top}>
        <div className="h-6 flex flex-row items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              node.data.onEdit?.();
            }}
            className=" z-50 p-1 bg-warning-500 hover:bg-warning-600 text-white rounded-md items-center justify-center"
            style={{ height: '100%', aspectRatio: '1/1' }}
          >
            <Edit size={"100%"} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              node.data.onDelete?.();
            }}
            className="flex z-50 mr-2 p-1 bg-error-500 hover:bg-error-600 text-white rounded-md items-center justify-center"
            style={{ height: '100%', aspectRatio: '1/1' }}
          >
            <Trash2 size={"100%"} />
          </button>
        </div>
      </NodeToolbar>
      <NodeResizer
        minWidth={64}
        minHeight={64}
        isVisible={node.selected}
        keepAspectRatio={true}
        handleStyle={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#ff0071',
          border: '1px solid #ddd',
          cursor: 'resize',
          zIndex: 9999
        }} />

      <div className='group' style={style} onClick={navigationUrl ? handleNodeClick : undefined}>
        {node.data.image && (
          <img
            src={node.data.image}
            alt={"node image"}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: node.data.opacity ? node.data.opacity / 100 : 1,
              zIndex: 1
            }}
          />
        )}
        {/* <div className=" h-[5%] rounded m-1 flex justify-between items-center relative z-10">
          <div className="h-full absolute right-0 top-4 bottom-0  flex flex-row items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onEdit?.();
              }}
              className="hidden group-hover:flex z-50 mr-2 p-1 bg-warning-500 hover:bg-warning-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1', minWidth: '56px', minHeight: '56px' }}
            >
              <Edit size={"100%"} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onDelete?.();
              }}
              className="hidden group-hover:flex z-50 mr-2 p-1 bg-error-500 hover:bg-error-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1', minWidth: '56px', minHeight: '56px' }}
            >
              <Trash2 size={"100%"} />
            </button>
          </div>
        </div> */}
      </div>
    </>
  );
});

ImageNode.displayName = 'ImageNode';

export default ImageNode;
