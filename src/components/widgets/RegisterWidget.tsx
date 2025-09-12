"use client";

import { useWebSocket } from "@/context/WebSocketContext";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

interface Register {
  id: string;
  label: string;
  analyzerId: string;
  address: number;
  dataType: string;
  bit?: number;
  valuePosition?: { x: number, y: number };
  labelPosition?: { x: number, y: number };
  valueSize?: { width: number, height: number };
  labelSize?: { width: number, height: number };
}

// Helper line state interface
interface HelperLineState {
  vertical: number | undefined;
  horizontal: number | undefined;
}

interface RegisterWidgetProps {
  title: string;
  registers: Register[];
  onEdit: () => void;
  onDelete: () => void;
  id?: string; // Widget ID
  size?: { width: number, height: number }; // Widget size
  position?: { x: number, y: number }; // Widget position
}

// Constants for snapping
const SNAP_THRESHOLD = 8; // Pixels - daha hassas yakalama için küçülttüm
const SNAP_ATTRACTION = 2; // Snap kuvveti çarpanı
const GRID_SIZE = 10; // Grid size for snapping (px) - daha ince ızgara

// Resizable and draggable label component
const DraggableLabel: React.FC<{
  id: string;
  label: string;
  position: { x: number, y: number };
  size?: { width: number, height: number };
  onPositionChange: (id: string, position: { x: number, y: number }, isLabel: boolean) => void;
  onSizeChange?: (id: string, size: { width: number, height: number }, isLabel: boolean) => void;
  siblingPositions: Record<string, { x: number, y: number }>; // For snapping
  containerSize: { width: number, height: number }; // For boundary check
}> = ({ id, label, position, size = { width: 80, height: 28 }, onPositionChange, onSizeChange, siblingPositions, containerSize }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(position);
  const [currentSize, setCurrentSize] = useState(size);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const positionRef = useRef(currentPosition);

  useEffect(() => {
    if (size) {
      setCurrentSize(size);
    }
  }, [size]);
  
  useEffect(() => {
    setCurrentPosition(position);
    positionRef.current = position;
  }, [position]);
  const [helperLines, setHelperLines] = useState<HelperLineState>({ vertical: undefined, horizontal: undefined });

  // Mouse olayları için işleyiciler
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - currentPosition.x,
      y: e.clientY - currentPosition.y
    });
    
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };

    // Boundary check
    newPosition.x = Math.max(0, Math.min(newPosition.x, containerSize.width - currentSize.width));
    newPosition.y = Math.max(0, Math.min(newPosition.y, containerSize.height - currentSize.height));
    
    // Check for snapping to other elements
    let snappedPosition = { ...newPosition };
    let newHelperLines: HelperLineState = { vertical: undefined, horizontal: undefined };
    
    // 1. Snap to grid
    const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
    const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
    
    const distanceToGridX = Math.abs(gridSnappedX - newPosition.x);
    const distanceToGridY = Math.abs(gridSnappedY - newPosition.y);
    
    if (distanceToGridX < SNAP_THRESHOLD / 2) {
      // Snap with attraction effect - pozisyon farkına göre daha güçlü çekim
      const attraction = 1 + ((SNAP_THRESHOLD / 2) - distanceToGridX) * SNAP_ATTRACTION / SNAP_THRESHOLD;
      snappedPosition.x = gridSnappedX;
      newHelperLines = {...newHelperLines, vertical: gridSnappedX};
    }
    
    if (distanceToGridY < SNAP_THRESHOLD / 2) {
      // Snap with attraction effect
      const attraction = 1 + ((SNAP_THRESHOLD / 2) - distanceToGridY) * SNAP_ATTRACTION / SNAP_THRESHOLD;
      snappedPosition.y = gridSnappedY;
      newHelperLines = {...newHelperLines, horizontal: gridSnappedY};
    }
    
    // 2. Find closest elements for snapping
    Object.entries(siblingPositions).forEach(([elId, elPos]) => {
      if (elId === id) return; // Skip self
      
      // Get element center and edges for more snap points
      const currentWidth = currentSize.width;
      const currentHeight = currentSize.height;
      const currentCenterX = snappedPosition.x + currentWidth / 2;
      const currentCenterY = snappedPosition.y + currentHeight / 2;
      const currentRight = snappedPosition.x + currentWidth;
      const currentBottom = snappedPosition.y + currentHeight;
      
      // Other element dimensions (estimated - we don't know its exact size)
      const otherWidth = 80; // Estimated
      const otherHeight = 30; // Estimated
      const otherCenterX = elPos.x + otherWidth / 2;
      const otherCenterY = elPos.y + otherHeight / 2;
      const otherRight = elPos.x + otherWidth;
      const otherBottom = elPos.y + otherHeight;
      
      // *** Geliştirilmiş yatay hizalama noktaları ***
      const snapPoints = [
        { distance: Math.abs(elPos.x - snappedPosition.x),
          snapTo: elPos.x,
          snapLine: elPos.x,
          snapName: 'left-to-left' },
          
        { distance: Math.abs(otherCenterX - currentCenterX),
          snapTo: otherCenterX - currentWidth / 2,
          snapLine: otherCenterX,
          snapName: 'center-to-center' },
          
        { distance: Math.abs(otherRight - currentRight),
          snapTo: otherRight - currentWidth,
          snapLine: otherRight,
          snapName: 'right-to-right' },
          
        // Yeni: sol-merkez hizalama
        { distance: Math.abs(elPos.x - currentCenterX),
          snapTo: elPos.x - currentWidth / 2,
          snapLine: elPos.x,
          snapName: 'left-to-center' },
          
        // Yeni: merkez-sol hizalama
        { distance: Math.abs(otherCenterX - snappedPosition.x),
          snapTo: otherCenterX,
          snapLine: otherCenterX,
          snapName: 'center-to-left' },
          
        // Yeni: sağ-sol hizalama
        { distance: Math.abs(otherRight - snappedPosition.x),
          snapTo: otherRight,
          snapLine: otherRight,
          snapName: 'right-to-left' },
          
        // Yeni: sol-sağ hizalama
        { distance: Math.abs(elPos.x - currentRight),
          snapTo: elPos.x - currentWidth,
          snapLine: elPos.x,
          snapName: 'left-to-right' }
      ];
      
      // En yakın yatay snap noktasını bul
      const closestHorizontalSnap = snapPoints
        .filter(point => point.distance < SNAP_THRESHOLD)
        .sort((a, b) => a.distance - b.distance)[0];
        
      if (closestHorizontalSnap) {
        snappedPosition.x = closestHorizontalSnap.snapTo;
        newHelperLines = {...newHelperLines, vertical: closestHorizontalSnap.snapLine};
        // console.log('Snapped horizontally:', closestHorizontalSnap.snapName);
      }
      
      // *** Geliştirilmiş dikey hizalama noktaları ***
      const verticalSnapPoints = [
        { distance: Math.abs(elPos.y - snappedPosition.y),
          snapTo: elPos.y,
          snapLine: elPos.y,
          snapName: 'top-to-top' },
          
        { distance: Math.abs(otherCenterY - currentCenterY),
          snapTo: otherCenterY - currentHeight / 2,
          snapLine: otherCenterY,
          snapName: 'center-to-center' },
          
        { distance: Math.abs(otherBottom - currentBottom),
          snapTo: otherBottom - currentHeight,
          snapLine: otherBottom,
          snapName: 'bottom-to-bottom' },
          
        // Yeni: üst-merkez hizalama
        { distance: Math.abs(elPos.y - currentCenterY),
          snapTo: elPos.y - currentHeight / 2,
          snapLine: elPos.y,
          snapName: 'top-to-center' },
          
        // Yeni: merkez-üst hizalama
        { distance: Math.abs(otherCenterY - snappedPosition.y),
          snapTo: otherCenterY,
          snapLine: otherCenterY,
          snapName: 'center-to-top' },
          
        // Yeni: alt-üst hizalama
        { distance: Math.abs(otherBottom - snappedPosition.y),
          snapTo: otherBottom,
          snapLine: otherBottom,
          snapName: 'bottom-to-top' },
          
        // Yeni: üst-alt hizalama
        { distance: Math.abs(elPos.y - currentBottom),
          snapTo: elPos.y - currentHeight,
          snapLine: elPos.y,
          snapName: 'top-to-bottom' }
      ];
      
      // En yakın dikey snap noktasını bul
      const closestVerticalSnap = verticalSnapPoints
        .filter(point => point.distance < SNAP_THRESHOLD)
        .sort((a, b) => a.distance - b.distance)[0];
        
      if (closestVerticalSnap) {
        snappedPosition.y = closestVerticalSnap.snapTo;
        newHelperLines = {...newHelperLines, horizontal: closestVerticalSnap.snapLine};
        // console.log('Snapped vertically:', closestVerticalSnap.snapName);
      }
    });
    
    // Sonsuz güncelleme döngüsünü engellemek için performans optimizasyonu
    if (JSON.stringify(helperLines) !== JSON.stringify(newHelperLines)) {
      setHelperLines(newHelperLines);
    }
    
    // Pozisyon değişikliğini sadece gerekli olduğunda yapalım
    if (JSON.stringify(currentPosition) !== JSON.stringify(snappedPosition)) {
      setCurrentPosition(snappedPosition);
      positionRef.current = snappedPosition;
    }
    
    e.preventDefault();
  };
  
  
  const handleMouseUp = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    onPositionChange(id, positionRef.current, true);
    
    // Clear helper lines when dragging stops
    setTimeout(() => {
      setHelperLines({ vertical: undefined, horizontal: undefined });
    }, 300); // Small delay to let user see the final alignment
  };
  
  // Dokunmatik olaylar için işleyiciler
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - currentPosition.x,
      y: touch.clientY - currentPosition.y
    });
    
    e.stopPropagation();
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !e.touches[0]) return;
    
    const touch = e.touches[0];
    const newPosition = {
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    };
    
    // Dokunmatik olaylar için de optimizasyon
    if (JSON.stringify(currentPosition) !== JSON.stringify(newPosition)) {
      setCurrentPosition(newPosition);
      positionRef.current = newPosition;
    }
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    onPositionChange(id, positionRef.current, true);
  };
  
  useEffect(() => {
    if (isDragging) {
      // Mouse olayları
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Dokunmatik olaylar
      document.addEventListener('touchmove', handleTouchMove as EventListener);
      document.addEventListener('touchend', handleTouchEnd);
    } else {
      // Mouse olayları
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Dokunmatik olaylar
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    }
    
    return () => {
      // Mouse olayları
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Dokunmatik olaylar
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragStart]);
  

  // Dynamic font size based on element size
  const fontSize = Math.max(0.8, Math.min(1.0, currentSize.width / 100)) + 'rem';
  
  return (
    <>
      {/* Helper lines for snapping */}
      {helperLines.vertical !== undefined && (
        <div className="absolute top-0 h-full w-[1px] bg-blue-500 pointer-events-none z-50"
          style={{ left: `${helperLines.vertical}px` }}
        />
      )}
      {helperLines.horizontal !== undefined && (
        <div className="absolute left-0 w-full h-[1px] bg-blue-500 pointer-events-none z-50"
          style={{ top: `${helperLines.horizontal}px` }}
        />
      )}
      
      <div
        style={{
          position: 'absolute',
          left: `${currentPosition.x}px`,
          top: `${currentPosition.y}px`,
          width: `${currentSize.width}px`,
          height: `${currentSize.height}px`,
          transform: isDragging ? 'scale(1.02)' : 'scale(1)',
          zIndex: isDragging ? 10 : 1,
          transition: (isDragging) ? 'none' : 'transform 0.2s ease'
        }}
        className="bg-gray-100 dark:bg-gray-700 rounded-lg text-center cursor-move shadow-md border border-gray-200 dark:border-gray-600 flex items-center justify-center relative"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <p className="text-gray-600 dark:text-gray-300 font-medium truncate px-2" style={{ fontSize }}>
          {label}
        </p>
        
        {/* Resize handle removed */}
      </div>
    </>
  );
};

// Value component - sürüklenebilir ve yeniden boyutlandırılabilir değer
const RegisterValue: React.FC<{
  register: Register;
  onPositionChange: (id: string, position: { x: number, y: number }, isLabel: boolean) => void;
  onSizeChange?: (id: string, size: { width: number, height: number }, isLabel: boolean) => void;
  siblingPositions: Record<string, { x: number, y: number }>; // For snapping
  containerSize: { width: number, height: number }; // For boundary check
}> = ({ register, onPositionChange, onSizeChange, siblingPositions, containerSize }) => {
  const [value, setValue] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number, y: number }>(register.valuePosition || { x: 0, y: 0 });
  const [size, setSize] = useState<{ width: number, height: number }>(register.valueSize || { width: 120, height: 80 });
  const elementRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);

  useEffect(() => {
    if (register.valueSize) {
      setSize(register.valueSize);
    }
  }, [register.valueSize]);

  useEffect(() => {
    if (register.valuePosition) {
      setPosition(register.valuePosition);
      positionRef.current = register.valuePosition;
    }
  }, [register.valuePosition]);
  const { watchRegister, unwatchRegister } = useWebSocket();
  
  // For drag functionality
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [helperLines, setHelperLines] = useState<HelperLineState>({ vertical: undefined, horizontal: undefined });

  useEffect(() => {
    const handleValueChange = (newValue: any) => {
      setValue(newValue);
    };

    watchRegister(
      {
        analyzerId: register.analyzerId,
        address: register.address,
        dataType: register.dataType,
        registerId: register.id,
        bit: register.bit
      },
      handleValueChange
    );

    return () => {
      unwatchRegister(
        {
          analyzerId: register.analyzerId,
          address: register.address,
          dataType: register.dataType,
          bit: register.bit
        },
        handleValueChange
      );
    };
  }, [register, watchRegister, unwatchRegister]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };
    
    // Boundary check
    newPosition.x = Math.max(0, Math.min(newPosition.x, containerSize.width - size.width));
    newPosition.y = Math.max(0, Math.min(newPosition.y, containerSize.height - size.height));

    // Check for snapping to other elements
    let snappedPosition = { ...newPosition };
    let newHelperLines: HelperLineState = { vertical: undefined, horizontal: undefined };
    
    // 1. Snap to grid
    const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
    const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
    
    if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD / 2) {
      snappedPosition.x = gridSnappedX;
    }
    
    if (Math.abs(gridSnappedY - newPosition.y) < SNAP_THRESHOLD / 2) {
      snappedPosition.y = gridSnappedY;
    }
    
    // 2. Find closest elements for snapping
    Object.entries(siblingPositions).forEach(([elId, elPos]) => {
      if (elId === register.id) return; // Skip self
      
      // Get element center and edges for more snap points
      const currentWidth = size.width;
      const currentHeight = size.height;
      const currentCenterX = snappedPosition.x + currentWidth / 2;
      const currentCenterY = snappedPosition.y + currentHeight / 2;
      const currentRight = snappedPosition.x + currentWidth;
      const currentBottom = snappedPosition.y + currentHeight;
      
      // Other element dimensions (estimated - we don't know its exact size)
      const otherWidth = 80; // Estimated
      const otherHeight = 30; // Estimated
      const otherCenterX = elPos.x + otherWidth / 2;
      const otherCenterY = elPos.y + otherHeight / 2;
      const otherRight = elPos.x + otherWidth;
      const otherBottom = elPos.y + otherHeight;
      
      // Horizontal alignments (left, center, right)
      // Left edge to left edge
      if (Math.abs(elPos.x - snappedPosition.x) < SNAP_THRESHOLD) {
        snappedPosition.x = elPos.x;
        newHelperLines = {...newHelperLines, vertical: elPos.x};
      }
      
      // Center to center horizontally
      if (Math.abs(otherCenterX - currentCenterX) < SNAP_THRESHOLD) {
        snappedPosition.x = otherCenterX - currentWidth / 2;
        newHelperLines = {...newHelperLines, vertical: otherCenterX};
      }
      
      // Right edge to right edge
      if (Math.abs(otherRight - currentRight) < SNAP_THRESHOLD) {
        snappedPosition.x = otherRight - currentWidth;
        newHelperLines = {...newHelperLines, vertical: otherRight};
      }
      
      // Vertical alignments (top, center, bottom)
      // Top edge to top edge
      if (Math.abs(elPos.y - snappedPosition.y) < SNAP_THRESHOLD) {
        snappedPosition.y = elPos.y;
        newHelperLines = {...newHelperLines, horizontal: elPos.y};
      }
      
      // Center to center vertically
      if (Math.abs(otherCenterY - currentCenterY) < SNAP_THRESHOLD) {
        snappedPosition.y = otherCenterY - currentHeight / 2;
        newHelperLines = {...newHelperLines, horizontal: otherCenterY};
      }
      
      // Bottom edge to bottom edge
      if (Math.abs(otherBottom - currentBottom) < SNAP_THRESHOLD) {
        snappedPosition.y = otherBottom - currentHeight;
        newHelperLines = {...newHelperLines, horizontal: otherBottom};
      }
    });
    
    // Sonsuz güncelleme döngüsünü engellemek için performans optimizasyonu
    if (JSON.stringify(helperLines) !== JSON.stringify(newHelperLines)) {
      setHelperLines(newHelperLines);
    }
    
    // Pozisyon değişikliğini sadece gerekli olduğunda yapalım
    if (JSON.stringify(position) !== JSON.stringify(snappedPosition)) {
      setPosition(snappedPosition);
      positionRef.current = snappedPosition;
    }
    
    e.preventDefault();
  };
  
  
  const handleMouseUp = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    if (onPositionChange) {
      onPositionChange(register.id, positionRef.current, false);
    }
    
    // Clear helper lines when dragging stops
    setTimeout(() => {
      setHelperLines({ vertical: undefined, horizontal: undefined });
    }, 300); // Small delay to let user see the final alignment
  };
  
  // Dokunmatik olaylar için işleyiciler
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
    
    e.stopPropagation();
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !e.touches[0]) return;
    
    const touch = e.touches[0];
    const newPosition = {
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    };
    
    // Dokunmatik olaylar için de optimizasyon
    if (JSON.stringify(position) !== JSON.stringify(newPosition)) {
      setPosition(newPosition);
      positionRef.current = newPosition;
    }
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    if (onPositionChange) {
      onPositionChange(register.id, positionRef.current, false);
    }
  };
  
  useEffect(() => {
    if (isDragging) {
      // Mouse olayları
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Dokunmatik olaylar
      document.addEventListener('touchmove', handleTouchMove as EventListener);
      document.addEventListener('touchend', handleTouchEnd);
    } else {
      // Mouse olayları
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Dokunmatik olaylar
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    }
    
    return () => {
      // Mouse olayları
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Dokunmatik olaylar
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragStart]);
  

  // Dynamic font size based on element size
  const fontSize = Math.max(1.0, Math.min(2.0, size.width / 70)) + 'rem';
  
  return (
    <>
      {/* Helper lines for snapping */}
      {helperLines.vertical !== undefined && (
        <div className="absolute top-0 h-full w-[1px] bg-blue-500 pointer-events-none z-50"
          style={{ left: `${helperLines.vertical}px` }}
        />
      )}
      {helperLines.horizontal !== undefined && (
        <div className="absolute left-0 w-full h-[1px] bg-blue-500 pointer-events-none z-50"
          style={{ top: `${helperLines.horizontal}px` }}
        />
      )}
    
      <div
        ref={elementRef}
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          transform: isDragging ? 'scale(1.02)' : 'scale(1)',
          zIndex: isDragging ? 10 : 1,
          transition: isDragging ? 'none' : 'transform 0.2s ease'
        }}
        className="bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center cursor-move shadow-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center relative"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <p className="font-bold text-gray-900 dark:text-white" style={{ fontSize }}>
          {value !== null ? value.toString() : <span className="text-xs text-gray-500">Loading...</span>}
        </p>
        
        {/* Resize handle removed */}
      </div>
    </>
  );
};

export const RegisterWidget: React.FC<RegisterWidgetProps> = ({
  title,
  registers = [],
  onEdit,
  onDelete,
  id,
  size = { width: 600, height: 400 },
  position = { x: 0, y: 0 }
}) => {
  const [valuePositions, setValuePositions] = useState<Record<string, { x: number, y: number }>>({});
  const [labelPositions, setLabelPositions] = useState<Record<string, { x: number, y: number }>>({});
  const [valueSizes, setValueSizes] = useState<Record<string, { width: number, height: number }>>({});
  const [labelSizes, setLabelSizes] = useState<Record<string, { width: number, height: number }>>({});
  const [widgetSize, setWidgetSize] = useState(size);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    setWidgetSize(size);
  }, [size]);

  // For saving widget data to DB
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (!id) return;

    // Do not save on the initial mount, wait for user interaction.
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
    }
    
    const saveWidgetData = async () => {
      try {
        const response = await fetch(`/api/widgets/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            size: widgetSize,
            valuePositions,
            labelPositions,
            valueSizes,
            labelSizes
          }),
        });
        
        if (!response.ok) {
          console.error('Failed to save widget data');
        }
      } catch (error) {
        console.error('Error saving widget data:', error);
      }
    };
    
    // Use debounce technique to avoid too many API calls
    const timeoutId = setTimeout(() => {
      saveWidgetData();
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [id, widgetSize, valuePositions, labelPositions, valueSizes, labelSizes]);

  
  useEffect(() => {
    // This effect synchronizes the positions and sizes when the registers prop updates.
    const newValuePositions: Record<string, { x: number, y: number }> = {};
    const newLabelPositions: Record<string, { x: number, y: number }> = {};
    const newLabelSizes: Record<string, { width: number, height: number }> = {};
    const newValueSizes: Record<string, { width: number, height: number }> = {};

    registers.forEach(reg => {
      newValuePositions[reg.id] = reg.valuePosition || { x: 0, y: 0 };
      newLabelPositions[reg.id] = reg.labelPosition || { x: 0, y: 0 };
      newLabelSizes[reg.id] = reg.labelSize || { width: 80, height: 28 };
      newValueSizes[reg.id] = reg.valueSize || { width: 120, height: 80 };
    });

    setValuePositions(newValuePositions);
    setLabelPositions(newLabelPositions);
    setLabelSizes(newLabelSizes);
    setValueSizes(newValueSizes);
  }, [registers]);

  const handlePositionChange = (id: string, position: { x: number, y: number }, isLabel: boolean) => {
    if (isLabel) {
      setLabelPositions(prev => ({
        ...prev,
        [id]: position
      }));
    } else {
      setValuePositions(prev => ({
        ...prev,
        [id]: position
      }));
    }
  };
  
  const handleSizeChange = (id: string, size: { width: number, height: number }, isLabel: boolean) => {
    if (isLabel) {
      setLabelSizes(prev => ({
        ...prev,
        [id]: size
      }));
    } else {
      setValueSizes(prev => ({
        ...prev,
        [id]: size
      }));
    }
  };
  
  // Combine all positions for snapping
  const allPositions = useMemo(() => {
    return {
      ...valuePositions,
      ...labelPositions
    };
  }, [valuePositions, labelPositions]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 relative group border border-transparent hover:border-blue-500 transition-all duration-300"
      style={{
        width: `${widgetSize.width}px`,
        height: `${widgetSize.height}px`,
        position: 'relative'
      }}
    >
        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <PencilSquareIcon className="h-5 w-5" />
            </button>
            <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <TrashIcon className="h-5 w-5" />
            </button>
        </div>
      
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center tracking-wider">{title}</h3>
      
        <div
          ref={containerRef}
          className="absolute rounded-lg border border-gray-300 dark:border-gray-600"
          style={{
            top: '64px',
            left: '24px',
            right: '24px',
            bottom: '40px',
            overflow: "hidden"
          }}
        >
            {registers.filter(reg => reg && reg.id).map((reg) => {
              // Ensure register has valid ID before rendering
              if (!reg || !reg.id) return null;
              
              // Do not render the draggable components until their positions are loaded.
              if (!labelPositions[reg.id] || !valuePositions[reg.id]) {
                return null;
              }
              
              // Ensure unique keys for all components
              const registerKey = `register-${reg.id}`;
              
              return (
                <React.Fragment key={registerKey}>
                  <DraggableLabel
                    key={`label-${reg.id}`}
                    id={reg.id}
                    label={reg.label || ''}
                    position={labelPositions[reg.id]}
                    size={labelSizes[reg.id]}
                    onPositionChange={handlePositionChange}
                    onSizeChange={handleSizeChange}
                    siblingPositions={allPositions}
                    containerSize={{ width: widgetSize.width - 48, height: widgetSize.height - 104 }}
                  />
                  <RegisterValue
                    key={`value-${reg.id}`}
                    register={{
                      ...reg,
                      valuePosition: valuePositions[reg.id],
                      valueSize: valueSizes[reg.id]
                    }}
                    onPositionChange={handlePositionChange}
                    onSizeChange={handleSizeChange}
                    siblingPositions={allPositions}
                    containerSize={{ width: widgetSize.width - 48, height: widgetSize.height - 104 }}
                  />
                </React.Fragment>
              );
            })}
        </div>
        
        {/* Widget resize handle removed */}
    </div>
  );
};