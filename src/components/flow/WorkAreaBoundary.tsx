import React from 'react';
import { useStore, Transform } from 'reactflow';
import { useAuth } from '@/hooks/use-auth';

interface WorkAreaBoundaryProps {
  bounds: [[number, number], [number, number]];
  backgroundImage: string | null;
  backgroundOpacity: number;
  backgroundColor: string;
}

const WorkAreaBoundary: React.FC<WorkAreaBoundaryProps> = ({ bounds, backgroundImage, backgroundOpacity, backgroundColor }) => {
  const transform = useStore((state) => state.transform);
  const { isAdmin } = useAuth();
  // Sınırları al
  const [[minX, minY], [maxX, maxY]] = bounds;
  
  // ReactFlow'un transform değerlerini kullan
  const [x, y, zoom] = transform;
  
  // Dikdörtgenin köşe noktalarını hesapla
  const topLeft = {
    x: minX * zoom + x,
    y: minY * zoom + y,
  };
  
  const width = (maxX - minX) * zoom;
  const height = (maxY - minY) * zoom;
  
  return (
    <div className="absolute pointer-events-none z-0">
      <div
        className={"absolute " + ((isAdmin) ? "border-2 border-dashed border-blue-400" : "")}
        style={{
          left: `${topLeft.x}px`,
          top: `${topLeft.y}px`,
          width: `${width}px`,
          height: `${height}px`,
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: backgroundOpacity / 100,
          backgroundColor,
        }}
      >
        {/* <div className="absolute top-0 left-0 bg-blue-400 text-white text-xs px-1 py-0.5 rounded-br">
          Work Area
        </div> */}
      </div>
    </div>
  );
};

export default WorkAreaBoundary;
