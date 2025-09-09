"use client";

import fitty, { FittyInstance } from 'fitty';
import { Edit, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useRef, useState } from 'react';
import { NodeProps, NodeResizer, NodeToolbar, Position } from 'reactflow';
import { showConfirmAlert } from '../ui/alert';
import { useAuth } from '@/hooks/use-auth';

interface TextNodeData {
  text: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  opacity?: number;
  navigationUrl?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const TextNode = memo((node: NodeProps<TextNodeData>) => {
  const { text, textColor = '#ffffff', backgroundColor = '#000000', fontFamily = 'Arial, sans-serif', navigationUrl, opacity } = node.data;
  const textRef = useRef<HTMLDivElement | null>(null);
  const fittyInstanceRef = useRef<FittyInstance | null>(null);
  const router = useRouter();
  const [buildings, setBuildings] = useState<any[]>([]);
  const { isAdmin } = useAuth()
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
  // useEffect(() => {
  //   if (textRef.current) {
  //     fittyInstanceRef.current = fitty(textRef.current, {
  //       minSize: 12,
  //       multiLine: false,
  //     });
  //   }

  //   return () => {
  //     fittyInstanceRef.current?.unsubscribe();
  //   };
  // }, []);

  // Boyut değişikliklerini izlemek için ResizeObserver kullanıyoruz
  useEffect(() => {
    if (!textRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width;
        const containerHeight = entry.contentRect.height;

        if (textRef.current) {
          // Hem genişlik hem yüksekliğe göre en uygun font boyutunu hesapla
          const parentElement = textRef.current.parentElement;
          if (parentElement) {
            const parentWidth = parentElement.clientWidth * 0.8;
            const parentHeight = parentElement.clientHeight * 0.8;

            // Genişlik ve yüksekliğe göre güvenli bir font boyutu hesapla
            const widthRatio = parentWidth / (text.toString().length * 20); // Karakter başına yaklaşık 20px
            const heightRatio = parentHeight / 40; // Yükseklik için yaklaşık 40px

            // İki orandan küçük olanı seç (taşmayı önlemek için)
            const ratio = Math.min(widthRatio, heightRatio);

            // Font boyutunu güncelle (minimum 12px, maksimum 200px)
            const fontSize = Math.max(12, Math.floor(ratio * 40));
            textRef.current.style.fontSize = `${fontSize}px`;
          }
        }
      }
    });

    resizeObserver.observe(textRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [text]);


  useEffect(() => {
    const interval = setInterval(() => {
      fittyInstanceRef.current?.fit();
    }, 5);

    return () => clearInterval(interval);
  }, []);
  // Arkaplan renginden opacity değerini ayıkla

  function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = opacity;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

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

  const handleNodeClick = async (e: React.MouseEvent) => {
    if (isAdmin) {
      return
    }
    if (navigationUrl) {
      router.push(`/buildings/${navigationUrl}`);
    }
    //      console.log("node clicked", navigationUrl);
    //     if (navigationUrl) {
    //       e.stopPropagation(); // React Flow'un olay yönetimini engelle
    //       console.log("router pushing", navigationUrl);
    //       const result = await showConfirmAlert(
    //         "Navigate to unit?",
    //         `This node has navigation to ${getSelectedItemName(navigationUrl)}.
    // Are you sure you want to navigate to this unit?`,
    //         "Yes",
    //         "Cancel",
    //       );
    //       if (result.isConfirmed) {
    //         router.push(`/units/${navigationUrl}`);
    //       }
    //     }
  };

  return (
    <div
      className="text-node relative group w-full h-full "
      onClick={handleNodeClick}
    >
      {isAdmin && (
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
      )}
      {/* Hem yatay hem dikey resize için NodeResizer */}
      {/* <NodeResizer
        color="#ff0071"
        isVisible={node.selected}
        minWidth={100}
        minHeight={50}
        keepAspectRatio={false} // En-boy oranını koruma
        handleStyle={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#ff0071',
          border: '1px solid #ddd',
          cursor: 'resize',
          zIndex: 9999
        }}
      /> */}

      {/* Metin konteyneri */}
      <div className="w-full h-full flex items-stretch justify-stretch relative text-center "
        style={{
          backgroundColor: hexToRgba(backgroundColor, opacity! / 100),
          fontFamily: fontFamily,
          border: node.selected && isAdmin ? '6px solid #f00' : 'none',
          borderRadius: '5px',
          cursor: navigationUrl ? 'pointer' : 'default'
        }}
      >
        {/* Yazının yer aldığı container */}
        <div
          ref={textRef}
          className=" flex-1 w-full h-full flex items-center justify-center overflow-hidden text-center"
          style={{
            color: textColor,
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => navigationUrl && !node.selected && handleNodeClick(e)}
        >
          {text}
        </div>

        {/* Düzenleme butonları
        <div className=" h-[5%] rounded m-1 flex justify-between items-center relative z-10">
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
    </div>
  );
});


export default memo(TextNode);
