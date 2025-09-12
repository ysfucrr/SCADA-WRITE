"use client";

import { useWebSocket } from "@/context/WebSocketContext";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { WidgetToolbar } from './WidgetToolbar';
import { WidgetDnDProvider, useWidgetDnD } from '@/context/WidgetDnDContext';
import { AddRegisterToWidgetModal } from './AddRegisterToWidgetModal';
import { AddLabelModal } from './AddLabelModal';
import { EditRegisterModal } from './EditRegisterModal';


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
  onDelete: () => void;
  onPositionsChange: (widgetId: string, newPositions: { labelPositions: any, valuePositions: any }) => void;
  onRegisterDelete: (widgetId: string, registerId: string) => void;
  onRegisterAdd: (widgetId: string, newRegister: any) => void;
  onEdit: () => void;
  id?: string; // Widget ID
  size?: { width: number, height: number }; // Widget size
  position?: { x: number, y: number }; // Widget position
}

// Constants for snapping
const SNAP_THRESHOLD = 8;
const SNAP_ATTRACTION = 2;
const GRID_SIZE = 10;

// Resizable and draggable label component
const DraggableLabel: React.FC<{
  id: string;
  label: string;
  position: { x: number, y: number };
  size?: { width: number, height: number };
  onPositionChange: (id: string, position: { x: number, y: number }, isLabel: boolean) => void;
  onSizeChange?: (id: string, size: { width: number, height: number }, isLabel: boolean) => void;
  onSetActive: () => void;
  isActive: boolean;
  onDeleteClick: () => void;
  onEditClick: (id: string) => void;
  siblingPositions: Record<string, { x: number, y: number }>;
  containerSize: { width: number, height: number };
}> = ({ id, label, position, size = { width: 80, height: 28 }, onPositionChange, onSizeChange, siblingPositions, containerSize, isActive, onSetActive, onDeleteClick, onEditClick }) => {
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - currentPosition.x, y: e.clientY - currentPosition.y });
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };

    newPosition.x = Math.max(0, Math.min(newPosition.x, containerSize.width - currentSize.width));
    newPosition.y = Math.max(0, Math.min(newPosition.y, containerSize.height - currentSize.height));
    
    let snappedPosition = { ...newPosition };
    let newHelperLines: HelperLineState = { vertical: undefined, horizontal: undefined };
    
    const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
    const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
    
    if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD / 2) {
      snappedPosition.x = gridSnappedX;
      newHelperLines = {...newHelperLines, vertical: gridSnappedX};
    }
    
    if (Math.abs(gridSnappedY - newPosition.y) < SNAP_THRESHOLD / 2) {
      snappedPosition.y = gridSnappedY;
      newHelperLines = {...newHelperLines, horizontal: gridSnappedY};
    }
    
    Object.entries(siblingPositions).forEach(([elId, elPos]) => {
      if (elId === id) return;
      
      const currentWidth = currentSize.width;
      const currentHeight = currentSize.height;
      const currentCenterX = snappedPosition.x + currentWidth / 2;
      const currentCenterY = snappedPosition.y + currentHeight / 2;
      
      const otherWidth = 80;
      const otherHeight = 30;
      const otherCenterX = elPos.x + otherWidth / 2;
      const otherCenterY = elPos.y + otherHeight / 2;
      const otherRight = elPos.x + otherWidth;
      const otherBottom = elPos.y + otherHeight;
      
      const snapPoints = [
        { distance: Math.abs(elPos.x - snappedPosition.x), snapTo: elPos.x, snapLine: elPos.x },
        { distance: Math.abs(otherCenterX - currentCenterX), snapTo: otherCenterX - currentWidth / 2, snapLine: otherCenterX },
        { distance: Math.abs(otherRight - (snappedPosition.x + currentWidth)), snapTo: otherRight - currentWidth, snapLine: otherRight },
      ];
      
      const closestHorizontalSnap = snapPoints.filter(point => point.distance < SNAP_THRESHOLD).sort((a, b) => a.distance - b.distance)[0];
        
      if (closestHorizontalSnap) {
        snappedPosition.x = closestHorizontalSnap.snapTo;
        newHelperLines = {...newHelperLines, vertical: closestHorizontalSnap.snapLine};
      }
      
      const verticalSnapPoints = [
        { distance: Math.abs(elPos.y - snappedPosition.y), snapTo: elPos.y, snapLine: elPos.y },
        { distance: Math.abs(otherCenterY - currentCenterY), snapTo: otherCenterY - currentHeight / 2, snapLine: otherCenterY },
        { distance: Math.abs(otherBottom - (snappedPosition.y + currentHeight)), snapTo: otherBottom - currentHeight, snapLine: otherBottom },
      ];
      
      const closestVerticalSnap = verticalSnapPoints.filter(point => point.distance < SNAP_THRESHOLD).sort((a, b) => a.distance - b.distance)[0];
        
      if (closestVerticalSnap) {
        snappedPosition.y = closestVerticalSnap.snapTo;
        newHelperLines = {...newHelperLines, horizontal: closestVerticalSnap.snapLine};
      }
    });

    if (JSON.stringify(helperLines) !== JSON.stringify(newHelperLines)) {
      setHelperLines(newHelperLines);
    }
    
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
    setTimeout(() => setHelperLines({ vertical: undefined, horizontal: undefined }), 300);
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - currentPosition.x, y: touch.clientY - currentPosition.y });
    e.stopPropagation();
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !e.touches[0]) return;
    const touch = e.touches[0];
    const newPosition = { x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y };
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
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove as EventListener);
      document.addEventListener('touchend', handleTouchEnd);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragStart]);

  const fontSize = Math.max(0.8, Math.min(1.0, currentSize.width / 100)) + 'rem';
  
  return (
    <>
      {helperLines.vertical !== undefined && <div className="absolute top-0 h-full w-[1px] bg-blue-500 pointer-events-none z-50" style={{ left: `${helperLines.vertical}px` }} />}
      {helperLines.horizontal !== undefined && <div className="absolute left-0 w-full h-[1px] bg-blue-500 pointer-events-none z-50" style={{ top: `${helperLines.horizontal}px` }} />}
      
      <div
        style={{ position: 'absolute', left: `${currentPosition.x}px`, top: `${currentPosition.y}px`, width: `${currentSize.width}px`, height: `${currentSize.height}px`, transform: isDragging ? 'scale(1.02)' : 'scale(1)', zIndex: isDragging ? 10 : 1, transition: (isDragging) ? 'none' : 'transform 0.2s ease' }}
        className={`bg-gray-100 dark:bg-gray-700 rounded-lg text-center cursor-move shadow-md flex items-center justify-center relative transition-all duration-200 ${isActive ? 'border-2 border-blue-500' : 'border border-gray-200 dark:border-gray-600'}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={onSetActive}
      >
        <p className="text-gray-600 dark:text-gray-300 font-medium truncate px-2" style={{ fontSize }}>
          {label}
        </p>
        
        {isActive && (
          <div className="absolute -top-3 -right-3 flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-full shadow-lg border border-gray-200 dark:border-gray-600">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditClick(id);
              }}
              className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
              className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const RegisterValue: React.FC<{
  register: Register;
  onPositionChange: (id: string, position: { x: number, y: number }, isLabel: boolean) => void;
  onSizeChange?: (id: string, size: { width: number, height: number }, isLabel: boolean) => void;
  onSetActive: () => void;
  isActive: boolean;
  onDeleteClick: () => void;
  onEditClick: (id: string) => void;
  siblingPositions: Record<string, { x: number, y: number }>;
  containerSize: { width: number, height: number };
}> = ({ register, onPositionChange, onSizeChange, siblingPositions, containerSize, isActive, onSetActive, onDeleteClick, onEditClick }) => {
  const [value, setValue] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number, y: number }>(register.valuePosition || { x: 0, y: 0 });
  const [size, setSize] = useState<{ width: number, height: number }>(register.valueSize || { width: 120, height: 80 });
  const elementRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);

  useEffect(() => {
    if (register.valueSize) setSize(register.valueSize);
  }, [register.valueSize]);

  useEffect(() => {
    if (register.valuePosition) {
      setPosition(register.valuePosition);
      positionRef.current = register.valuePosition;
    }
  }, [register.valuePosition]);
  const { watchRegister, unwatchRegister } = useWebSocket();
  
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [helperLines, setHelperLines] = useState<HelperLineState>({ vertical: undefined, horizontal: undefined });

  useEffect(() => {
    const handleValueChange = (newValue: any) => setValue(newValue);
    watchRegister({ analyzerId: register.analyzerId, address: register.address, dataType: register.dataType, registerId: register.id, bit: register.bit }, handleValueChange);
    return () => unwatchRegister({ analyzerId: register.analyzerId, address: register.address, dataType: register.dataType, bit: register.bit }, handleValueChange);
  }, [register, watchRegister, unwatchRegister]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const newPosition = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    newPosition.x = Math.max(0, Math.min(newPosition.x, containerSize.width - size.width));
    newPosition.y = Math.max(0, Math.min(newPosition.y, containerSize.height - size.height));
    let snappedPosition = { ...newPosition };
    let newHelperLines: HelperLineState = { vertical: undefined, horizontal: undefined };
    const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
    const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
    if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD / 2) snappedPosition.x = gridSnappedX;
    if (Math.abs(gridSnappedY - newPosition.y) < SNAP_THRESHOLD / 2) snappedPosition.y = gridSnappedY;
    Object.entries(siblingPositions).forEach(([elId, elPos]) => {
      if (elId === register.id) return;
      const currentWidth = size.width;
      const currentHeight = size.height;
      const currentCenterX = snappedPosition.x + currentWidth / 2;
      const currentCenterY = snappedPosition.y + currentHeight / 2;
      const currentRight = snappedPosition.x + currentWidth;
      const currentBottom = snappedPosition.y + currentHeight;
      const otherWidth = 80;
      const otherHeight = 30;
      const otherCenterX = elPos.x + otherWidth / 2;
      const otherCenterY = elPos.y + otherHeight / 2;
      const otherRight = elPos.x + otherWidth;
      const otherBottom = elPos.y + otherHeight;
      if (Math.abs(elPos.x - snappedPosition.x) < SNAP_THRESHOLD) {
        snappedPosition.x = elPos.x;
        newHelperLines = {...newHelperLines, vertical: elPos.x};
      }
      if (Math.abs(otherCenterX - currentCenterX) < SNAP_THRESHOLD) {
        snappedPosition.x = otherCenterX - currentWidth / 2;
        newHelperLines = {...newHelperLines, vertical: otherCenterX};
      }
      if (Math.abs(otherRight - currentRight) < SNAP_THRESHOLD) {
        snappedPosition.x = otherRight - currentWidth;
        newHelperLines = {...newHelperLines, vertical: otherRight};
      }
      if (Math.abs(elPos.y - snappedPosition.y) < SNAP_THRESHOLD) {
        snappedPosition.y = elPos.y;
        newHelperLines = {...newHelperLines, horizontal: elPos.y};
      }
      if (Math.abs(otherCenterY - currentCenterY) < SNAP_THRESHOLD) {
        snappedPosition.y = otherCenterY - currentHeight / 2;
        newHelperLines = {...newHelperLines, horizontal: otherCenterY};
      }
      if (Math.abs(otherBottom - currentBottom) < SNAP_THRESHOLD) {
        snappedPosition.y = otherBottom - currentHeight;
        newHelperLines = {...newHelperLines, horizontal: otherBottom};
      }
    });
    if (JSON.stringify(helperLines) !== JSON.stringify(newHelperLines)) setHelperLines(newHelperLines);
    if (JSON.stringify(position) !== JSON.stringify(snappedPosition)) {
      setPosition(snappedPosition);
      positionRef.current = snappedPosition;
    }
    e.preventDefault();
  };
  
  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (onPositionChange) onPositionChange(register.id, positionRef.current, false);
    setTimeout(() => setHelperLines({ vertical: undefined, horizontal: undefined }), 300);
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    e.stopPropagation();
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !e.touches[0]) return;
    const touch = e.touches[0];
    const newPosition = { x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y };
    if (JSON.stringify(position) !== JSON.stringify(newPosition)) {
      setPosition(newPosition);
      positionRef.current = newPosition;
    }
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (onPositionChange) onPositionChange(register.id, positionRef.current, false);
  };
  
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove as EventListener);
      document.addEventListener('touchend', handleTouchEnd);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove as EventListener);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragStart]);
  

  const fontSize = Math.max(1.0, Math.min(2.0, size.width / 70)) + 'rem';
  
  return (
    <>
      {helperLines.vertical !== undefined && <div className="absolute top-0 h-full w-[1px] bg-blue-500 pointer-events-none z-50" style={{ left: `${helperLines.vertical}px` }}/>}
      {helperLines.horizontal !== undefined && <div className="absolute left-0 w-full h-[1px] bg-blue-500 pointer-events-none z-50" style={{ top: `${helperLines.horizontal}px` }}/>}
      <div
        ref={elementRef}
        style={{ position: 'absolute', left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: `${size.height}px`, transform: isDragging ? 'scale(1.02)' : 'scale(1)', zIndex: isDragging ? 10 : 1, transition: isDragging ? 'none' : 'transform 0.2s ease' }}
        className={`bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center cursor-move shadow-lg flex items-center justify-center relative transition-all duration-200 ${isActive ? 'border-2 border-blue-500' : 'border border-gray-200 dark:border-gray-600'}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={onSetActive}
      >
        <p className="font-bold text-gray-900 dark:text-white" style={{ fontSize }}>
          {value !== null ? value.toString() : <span className="text-xs text-gray-500">Loading...</span>}
        </p>
        
        {isActive && (
          <div className="absolute -top-3 -right-3 flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-full shadow-lg border border-gray-200 dark:border-gray-600">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditClick(register.id);
              }}
              className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
              className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const WidgetContent: React.FC<Omit<RegisterWidgetProps, 'registers'> & { registers: Register[] }> = ({
  title,
  registers = [],
  onDelete,
  onPositionsChange,
  onRegisterDelete,
  onRegisterAdd,
  onEdit,
  id,
  size = { width: 600, height: 400 },
}) => {
  const [valuePositions, setValuePositions] = useState<Record<string, { x: number, y: number }>>({});
  const [labelPositions, setLabelPositions] = useState<Record<string, { x: number, y: number }>>({});
  const [valueSizes, setValueSizes] = useState<Record<string, { width: number, height: number }>>({});
  const [labelSizes, setLabelSizes] = useState<Record<string, { width: number, height: number }>>({});
  const [widgetSize, setWidgetSize] = useState(size);
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAddRegisterModalOpen, setIsAddRegisterModalOpen] = useState(false);
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isEditRegisterModalOpen, setIsEditRegisterModalOpen] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState<Register | null>(null);
  const [dropPosition, setDropPosition] = useState<{x: number, y: number} | null>(null);
  const { draggedType } = useWidgetDnD();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropX = e.clientX - (containerRef.current?.getBoundingClientRect().left || 0);
    const dropY = e.clientY - (containerRef.current?.getBoundingClientRect().top || 0);

    if (draggedType === 'register') {
      setDropPosition({ x: dropX, y: dropY });
      setIsAddRegisterModalOpen(true);
    } else if (draggedType === 'label') {
      setDropPosition({ x: dropX, y: dropY });
      setIsAddLabelModalOpen(true);
    }
  };
  
  // Handle register edit button click
  const handleEditRegister = (registerId: string) => {
    const register = registers.find(reg => reg.id === registerId);
    if (register) {
      setSelectedRegister(register);
      setIsEditRegisterModalOpen(true);
    }
  };
  
  // Handle register update
  const handleUpdateRegister = async (updatedRegister: any) => {
    if (!id) return;
    
    try {
      console.log("Updating register with data:", updatedRegister);
      
      // Mevcut registers listesini al
      const currentRegisters = [...registers];
      
      // Güncellenecek register'ın index'ini bul
      const registerIndex = currentRegisters.findIndex(reg => reg.id === updatedRegister.id);
      
      if (registerIndex === -1) {
        console.error("Register not found in the list:", updatedRegister.id);
        return;
      }
      
      // Register'ı güncelle
      const updatedRegisterData = {
        ...currentRegisters[registerIndex],
        ...updatedRegister
      };
      
      // Özellikle valueSize ve labelSize'ı belirgin olarak güncelliyoruz
      if (updatedRegister.valueSize) {
        updatedRegisterData.valueSize = updatedRegister.valueSize;
      }
      
      if (updatedRegister.labelSize) {
        updatedRegisterData.labelSize = updatedRegister.labelSize;
      }
      
      // Yerelde registers dizisini güncelle
      currentRegisters[registerIndex] = updatedRegisterData;
      
      // State'leri güncelle
      if (updatedRegister.valueSize) {
        setValueSizes(prev => ({...prev, [updatedRegister.id]: updatedRegister.valueSize}));
      }
      
      if (updatedRegister.labelSize) {
        setLabelSizes(prev => ({...prev, [updatedRegister.id]: updatedRegister.labelSize}));
      }
      
      // Widget'ı veritabanında güncelle
      const response = await fetch(`/api/widgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registers: currentRegisters
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.message || 'Unknown error'}`);
      }
      
      console.log("Register updated successfully");
    } catch (error) {
      console.error("Error updating register:", error);
    }
  };

  const handleAddRegister = (newRegisterData: any) => {
    if (id && dropPosition) {
      // Varsayılan boyut değerlerini açıkça belirterek register ekle
      const newRegisterWithPosition = {
        ...newRegisterData,
        valuePosition: dropPosition,
      };
      onRegisterAdd(id, newRegisterWithPosition);
    }
  };
  
  const handleAddLabel = (newLabelData: any) => {
    if (id && dropPosition) {
      // Generate a unique ID for the label
      const labelId = `label-${Date.now()}`;
      
      // Emin olmak için varsayılan boyut değerini kontrol et
      const labelSize = newLabelData.size || { width: 80, height: 28 };
      
      // Create a label-only element with explicit sizing
      const newLabel = {
        id: labelId,
        label: newLabelData.text,
        labelPosition: dropPosition,
        labelSize: labelSize, // Açıkça belirtilen veya varsayılan boyut değerini kullan
        // Add empty fields to make it compatible with existing register structure
        analyzerId: "",
        address: 0,
        dataType: "label",
        valuePosition: { x: -1000, y: -1000 }, // Position off-screen
        valueSize: { width: 0, height: 0 }
      };
      
      // API'ye kaydetmek için tüm bilgilerin olduğu register'ı ekle
      onRegisterAdd(id, newLabel);
    }
  };
  
  useEffect(() => {
    setWidgetSize(size);
  }, [size]);

  // Veri değişikliklerini veritabanına kaydetme
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (!id || isInitialMount.current) return;
    
    // Her veri değişikliğinde tüm veriyi kaydetmek yerine, değişikliklerin birikip
    // toplu olarak kaydedilmesi için zamanlayıcı kullanıyoruz
    const saveTimer = setTimeout(async () => {
      try {
        // Güncel register verilerini widget içinde sakla
        const updatedRegisters = registers.map(reg => {
          const updatedReg = {
            ...reg,
            valuePosition: valuePositions[reg.id] || reg.valuePosition,
            valueSize: valueSizes[reg.id] || reg.valueSize,
          };
          if (reg.dataType === "label") {
            updatedReg.labelPosition = labelPositions[reg.id] || reg.labelPosition;
            updatedReg.labelSize = labelSizes[reg.id] || reg.labelSize;
          }
          return updatedReg;
        });
        
        await fetch(`/api/widgets/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            size: widgetSize,
            registers: updatedRegisters
          }),
        });
      } catch (error) {
        console.error('Error saving widget data:', error);
      }
    }, 500); // Yarım saniye gecikme ile kaydet
    
    return () => clearTimeout(saveTimer);
  }, [id, widgetSize, registers, valuePositions, labelPositions, valueSizes, labelSizes]);

  useEffect(() => { isInitialMount.current = false; }, []);

  useEffect(() => {
    const newValuePositions: Record<string, { x: number, y: number }> = {};
    const newLabelPositions: Record<string, { x: number, y: number }> = {};
    const newLabelSizes: Record<string, { width: number, height: number }> = {};
    const newValueSizes: Record<string, { width: number, height: number }> = {};

    registers.forEach(reg => {
      newValuePositions[reg.id] = valuePositions[reg.id] || reg.valuePosition || { x: 0, y: 0 };
      newLabelPositions[reg.id] = labelPositions[reg.id] || reg.labelPosition || { x: 0, y: 0 };
      newLabelSizes[reg.id] = labelSizes[reg.id] || (reg.dataType === "label" ? (reg.labelSize || { width: 80, height: 28 }) : null);
      newValueSizes[reg.id] = valueSizes[reg.id] || reg.valueSize || { width: 120, height: 80 };
    });

    setValuePositions(newValuePositions);
    setLabelPositions(newLabelPositions);
    setLabelSizes(newLabelSizes);
    setValueSizes(newValueSizes);
  }, [registers]);


  const handlePositionChange = async (registerId: string, position: { x: number, y: number }, isLabel: boolean) => {
    // Pozisyonları güncelle
    const newLabelPositions = { ...labelPositions };
    const newValuePositions = { ...valuePositions };

    if (isLabel) {
      newLabelPositions[registerId] = position;
      setLabelPositions(newLabelPositions);
    } else {
      newValuePositions[registerId] = position;
      setValuePositions(newValuePositions);
    }

    try {
      // Pozisyon değişikliğini veritabanına kaydet, ancak diğer özellikleri (size vb.) koruyarak
      if (id) {
        // Mevcut registers dizisini kopyala
        const currentRegisters = [...registers];
        
        // Değiştirilen register'ı bul
        const registerIndex = currentRegisters.findIndex(reg => reg.id === registerId);
        if (registerIndex === -1) return;
        
        // Güncel register verisini al
        const updatedRegister = {...currentRegisters[registerIndex]};
        
        // Sadece pozisyon bilgisini güncelle, diğer bilgileri koru
        if (isLabel) {
          if (updatedRegister.dataType === "label") {
            updatedRegister.labelPosition = position;
          }
        } else {
          updatedRegister.valuePosition = position;
        }
        
        // Boyut bilgilerini açıkça belirt (state'ten al)
        // Eğer state'te boyut bilgisi varsa, onu kullan
        const currentValueSize = valueSizes[registerId];
        
        if (currentValueSize) {
          updatedRegister.valueSize = { ...currentValueSize };
        } else if (updatedRegister.valueSize) {
          // State'te değer yoksa ama register'da varsa onu koru
          updatedRegister.valueSize = { ...updatedRegister.valueSize };
        } else {
          // Hiçbir değer yoksa varsayılan değerleri kullan
          updatedRegister.valueSize = { width: 120, height: 80 };
        }
        
        // Label için sadece dataType "label" ise labelSize ayarla
        if (updatedRegister.dataType === "label") {
          const currentLabelSize = labelSizes[registerId];
          if (currentLabelSize) {
            updatedRegister.labelSize = { ...currentLabelSize };
          } else if (updatedRegister.labelSize) {
            updatedRegister.labelSize = { ...updatedRegister.labelSize };
          } else {
            updatedRegister.labelSize = { width: 80, height: 28 };
          }
        } else {
          // Normal register için label alanlarını temizle
          delete updatedRegister.labelPosition;
          delete updatedRegister.labelSize;
        }
        
        // Güncellenmiş register'ı diziye yerleştir
        currentRegisters[registerIndex] = updatedRegister;
        
        // Veritabanına kaydet
        await fetch(`/api/widgets/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registers: currentRegisters
          }),
        });
        
        // Parent handler'ı çağır
        if (onPositionsChange) {
          onPositionsChange(id, {
            labelPositions: newLabelPositions,
            valuePositions: newValuePositions,
          });
        }
      }
    } catch (error) {
      console.error("Error saving position change:", error);
    }
  };
  
  const handleSizeChange = async (elementId: string, size: { width: number, height: number }, isLabel: boolean) => {
    // Boyutları yerel state'te güncelle
    if (isLabel) {
      setLabelSizes(prev => ({ ...prev, [elementId]: size }));
    } else {
      setValueSizes(prev => ({ ...prev, [elementId]: size }));
    }

    try {
      // Boyut değişikliğini veritabanına kaydet
      if (id) {
        // Mevcut registers dizisini kopyala
        const currentRegisters = [...registers];
        
        // Değiştirilen register'ı bul
        const registerIndex = currentRegisters.findIndex(reg => reg.id === elementId);
        if (registerIndex === -1) return;
        
        // Güncel register verisini al
        const updatedRegister = {...currentRegisters[registerIndex]};
        
        // Sadece boyut bilgisini güncelle, diğer bilgileri koru
        if (isLabel) {
          if (updatedRegister.dataType === "label") {
            updatedRegister.labelSize = size;
          }
        } else {
          updatedRegister.valueSize = size;
        }
        
        // Pozisyon bilgilerini açıkça belirt (state'ten al)
        updatedRegister.valuePosition = valuePositions[elementId] || updatedRegister.valuePosition;
        if (updatedRegister.dataType === "label") {
          updatedRegister.labelPosition = labelPositions[elementId] || updatedRegister.labelPosition;
        } else {
          delete updatedRegister.labelPosition;
          delete updatedRegister.labelSize;
        }
        
        // Güncellenmiş register'ı diziye yerleştir
        currentRegisters[registerIndex] = updatedRegister;
        
        // Veritabanına kaydet
        await fetch(`/api/widgets/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registers: currentRegisters
          }),
        });
      }
    } catch (error) {
      console.error("Error saving size change:", error);
    }
  };
  
  const allPositions = useMemo(() => ({ ...valuePositions, ...labelPositions }), [valuePositions, labelPositions]);

  return (
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 relative group border border-transparent hover:border-blue-500 transition-all duration-300"
        style={{ width: `${widgetSize.width}px`, height: `${widgetSize.height}px`, position: 'relative' }}
      >
        <AddRegisterToWidgetModal
            isOpen={isAddRegisterModalOpen}
            onClose={() => setIsAddRegisterModalOpen(false)}
            onConfirm={handleAddRegister}
        />
        
        <AddLabelModal
            isOpen={isAddLabelModalOpen}
            onClose={() => setIsAddLabelModalOpen(false)}
            onConfirm={handleAddLabel}
        />
        
        <EditRegisterModal
            isOpen={isEditRegisterModalOpen}
            onClose={() => setIsEditRegisterModalOpen(false)}
            onConfirm={handleUpdateRegister}
            register={selectedRegister}
        />
          <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30">
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
            style={{ top: '64px', left: '24px', right: '24px', bottom: '40px', overflow: "hidden" }}
            onClick={(e) => {
              if (e.target === containerRef.current) setActiveElementId(null);
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
              {registers.filter(reg => reg && reg.id).map((reg) => {
                if (!reg || !reg.id) return null;
                
                const registerKey = `register-${reg.id}`;
                const hasValue = valuePositions[reg.id];
                const hasLabel = reg.dataType === "label" && labelPositions[reg.id];
                
                if (!hasValue && !hasLabel) return null;
                
                return (
                  <React.Fragment key={registerKey}>
                    {hasLabel && (
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
                        isActive={activeElementId === `label-${reg.id}`}
                        onSetActive={() => {
                          setActiveElementId(`label-${reg.id}`);
                        }}
                        onDeleteClick={() => {
                            if (id) onRegisterDelete(id, reg.id);
                            setActiveElementId(null);
                        }}
                        onEditClick={handleEditRegister}
                      />
                    )}
                    {hasValue && (
                      <RegisterValue
                        key={`value-${reg.id}`}
                        register={{ ...reg, valuePosition: valuePositions[reg.id], valueSize: valueSizes[reg.id] }}
                        onPositionChange={handlePositionChange}
                        onSizeChange={handleSizeChange}
                        siblingPositions={allPositions}
                        containerSize={{ width: widgetSize.width - 48, height: widgetSize.height - 104 }}
                        isActive={activeElementId === `value-${reg.id}`}
                        onSetActive={() => {
                          setActiveElementId(`value-${reg.id}`);
                        }}
                        onDeleteClick={() => {
                            if (id) onRegisterDelete(id, reg.id);
                            setActiveElementId(null);
                        }}
                        onEditClick={handleEditRegister}
                      />
                    )}
                  </React.Fragment>
                );
              })}
          </div>
          <WidgetToolbar />
      </div>
  );
};

export const RegisterWidget: React.FC<RegisterWidgetProps> = (props) => (
    <WidgetDnDProvider>
        <WidgetContent {...props} />
    </WidgetDnDProvider>
);
