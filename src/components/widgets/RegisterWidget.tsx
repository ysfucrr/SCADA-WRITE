"use client";

import { useWebSocket } from "@/context/WebSocketContext";
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { WidgetToolbar } from './WidgetToolbar';
import { WidgetDnDProvider, useWidgetDnD } from '@/context/WidgetDnDContext';
import { AddRegisterToWidgetModal } from './AddRegisterToWidgetModal';
import { AddLabelModal } from './AddLabelModal';
import { EditRegisterModal } from './EditRegisterModal';
import { EditLabelModal } from './EditLabelModal';


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
  onRegisterUpdate?: (widgetId: string, registerId: string, updatedRegister: any) => void;
  onEdit: () => void;
  id?: string; // Widget ID
  size?: { width: number, height: number }; // Widget size
  position?: { x: number, y: number }; // Widget position
  onWidgetPositionChange?: (widgetId: string, newPosition: { x: number, y: number }) => void;
}

// Constants for snapping
const SNAP_THRESHOLD = 10;
const SNAP_ATTRACTION = 5;
const GRID_SIZE = 20;
const WIDGET_SNAP_THRESHOLD = 15; // Widget'lar arası snapping için eşik değeri - Daha düşük değer daha az yapışkan davranış sağlar
const VERTICAL_SNAP_MULTIPLIER = 0.5; // Dikey snapping için çarpan - 1'den küçük değerler dikey snapping'i daha zayıf yapar

// Sınır değerleri - widget'ların dışına çıkamayacağı alanı tanımlar
const BOUNDARY = {
  LEFT: 260, // Sol menü genişliği
  TOP: 290,  // Üst alan yüksekliği (sekme alanı ve başlık)
  RIGHT: 20, // Sağ kenardan boşluk
  BOTTOM: 20 // Alt kenardan boşluk
};

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

const WidgetContent: React.FC<Omit<RegisterWidgetProps, 'registers'> & { registers: Register[] }> = (props) => {
  const {
    title,
    registers = [],
    onDelete,
    onPositionsChange,
    onRegisterDelete,
    onRegisterAdd,
    onRegisterUpdate,
    onEdit,
    id,
    size = { width: 600, height: 400 },
    onWidgetPositionChange
  } = props;
  
  // Widget sürükleme state'leri
  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const [widgetDragStart, setWidgetDragStart] = useState({ x: 0, y: 0 });
  const [widgetPosition, setWidgetPosition] = useState(props.position || { x: 0, y: 0 });
  const widgetPositionRef = useRef(widgetPosition);
  
  // Sayfa yüksekliğini ayarlama fonksiyonu
  const adjustPageHeight = useCallback(() => {
    // Tüm widget'ların konumlarını ve boyutlarını al
    const allWidgets = document.querySelectorAll('.widget-container');
    let maxBottomPosition = 0;
    
    // Eğer hiç widget yoksa, minimum viewport yüksekliğini kullan
    if (allWidgets.length === 0) {
      document.body.style.minHeight = `${window.innerHeight}px`;
      return;
    }
    
    // Tüm widget'ları kontrol et ve en alttakini bul
    allWidgets.forEach((widget) => {
      const rect = widget.getBoundingClientRect();
      // Ekran scroll pozisyonunu da dikkate al
      const bottomPosition = window.scrollY + rect.bottom + 100; // 100px ekstra boşluk
      maxBottomPosition = Math.max(maxBottomPosition, bottomPosition);
    });
    
    // Viewport yüksekliği
    const viewportHeight = window.innerHeight;
    
    // Sayfanın yüksekliğini widget'ların en altının konumuna göre ayarla
    // Ancak en az viewport yüksekliği kadar olsun
    document.body.style.minHeight = `${Math.max(viewportHeight, maxBottomPosition)}px`;
    
    // Sayfa yüksekliği değiştiğinde konsola bilgi ver
    console.log(`Sayfa yüksekliği ayarlandı: ${Math.max(viewportHeight, maxBottomPosition)}px`);
  }, []);
  
  // Sayfa yüklendiğinde ilk yükseklik ayarını yap
  useEffect(() => {
    // Sayfa yüklendikten sonra çağır
    setTimeout(adjustPageHeight, 500);
    
    // Pencere boyutu değiştiğinde de yüksekliği ayarla
    window.addEventListener('resize', adjustPageHeight);
    return () => {
      window.removeEventListener('resize', adjustPageHeight);
    };
  }, [adjustPageHeight]);
  
  // Widget sürükleme yönetimi
  const handleWidgetMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsDraggingWidget(true);
    setWidgetDragStart({
      x: e.clientX - (props.position?.x || 0),
      y: e.clientY - (props.position?.y || 0)
    });
  };
  
  const handleWidgetTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    setIsDraggingWidget(true);
    setWidgetDragStart({
      x: touch.clientX - (props.position?.x || 0),
      y: touch.clientY - (props.position?.y || 0)
    });
  };
  
  // Widget grid çizgilerini göstermek için state
  const [widgetHelperLines, setWidgetHelperLines] = useState<{
    vertical: number | undefined,
    horizontal: number | undefined
  }>({ vertical: undefined, horizontal: undefined });
  
  // Diğer widget'ların pozisyonlarını alıp bu widget'ı snap etmek için kullanacağımız fonksiyon
  const getOtherWidgetPositions = useCallback(() => {
    // Widget'lar için kolayca erişilebilen bir prop yok
    // Burada document.querySelectorAll kullanarak DOM'dan diğer widget'ları alabiliriz
    const allWidgets = document.querySelectorAll('.widget-container');
    type OtherWidget = {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
    
    const otherWidgets: Array<OtherWidget> = [];
    
    allWidgets.forEach((el) => {
      const widgetId = el.getAttribute('data-widget-id');
      if (widgetId && widgetId !== id) {
        const rect = el.getBoundingClientRect();
        otherWidgets.push({
          id: widgetId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        });
      }
    });
    
    return otherWidgets;
  }, [id]);

  useEffect(() => {
    const handleWidgetMouseMove = (e: MouseEvent) => {
      if (!isDraggingWidget) return;
      e.preventDefault();
      
      const newPosition = {
        x: e.clientX - widgetDragStart.x,
        y: e.clientY - widgetDragStart.y
      };
      
      // Sınırları uygula - Widget'ın dışarı çıkmasını engelle
      // Sol sınır (menü genişliği)
      newPosition.x = Math.max(BOUNDARY.LEFT, newPosition.x);
      
      // Üst sınır (sekme alanı yüksekliği)
      newPosition.y = Math.max(BOUNDARY.TOP, newPosition.y);
      
      // Sağ sınır (pencere genişliğini dikkate alarak)
      const windowWidth = window.innerWidth - BOUNDARY.RIGHT;
      
      // Sadece sağ sınırı uygula, alt sınırı uygulama (aşağı kaydırma için)
      newPosition.x = Math.min(newPosition.x, windowWidth - widgetSize.width);
      
      // Sayfa kaydırma - Fare imleci viewport'un alt kısmına yakınsa
      const viewportHeight = window.innerHeight;
      const mousePositionInViewport = e.clientY;
      const scrollThreshold = 50; // Alt kenardan 50px içinde ise kaydır
      
      // Eğer fare imleci alt kenara yakınsa ve widget aşağı doğru sürükleniyorsa
      if (mousePositionInViewport > viewportHeight - scrollThreshold &&
          newPosition.y > widgetPosition.y) {
        // Sayfayı aşağı kaydır
        window.scrollBy(0, 10); // Her seferinde 10px kaydır
        
        // Widget'ın alt kenarını hesapla (ekran koordinatları + scroll)
        const widgetBottom = newPosition.y + widgetSize.height + window.scrollY;
        
        // Sayfa aşağıya doğru büyüsün - gerekirse body min-height ayarla
        const body = document.body;
        
        // Widget'ın alt kenarı + 100px boşluk bırak
        const neededHeight = widgetBottom + 100;
        
        // Mevcut yükseklikten daha fazlaysa ayarla
        if (neededHeight > body.offsetHeight) {
          body.style.minHeight = neededHeight + 'px';
        }
      }
      
      // Grid'e snapping - 20px grid'e snap et
      const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
      const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
      
      let snappedPosition = { ...newPosition };
      let newHelperLines: {vertical: number | undefined, horizontal: number | undefined} = { vertical: undefined, horizontal: undefined };
      
      // Grid snapping
      if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD) {
        snappedPosition.x = gridSnappedX;
        newHelperLines.vertical = gridSnappedX;
      }
      
      if (Math.abs(gridSnappedY - newPosition.y) < SNAP_THRESHOLD) {
        snappedPosition.y = gridSnappedY;
        newHelperLines.horizontal = gridSnappedY;
      }
      
      // Diğer widget'lara snapping
      const otherWidgets = getOtherWidgetPositions();
      
      // Fare tuşlarının durumunu kontrol et - Shift tuşu basılıysa snapping'i geçici olarak devre dışı bırak
      const isShiftKeyPressed = e.shiftKey;
      
      if (!isShiftKeyPressed) {
        // Hareket yönünü belirle
        const isMovingDown = newPosition.y > widgetPosition.y;
        const isMovingUp = newPosition.y < widgetPosition.y;
        
        // Diğer widget'lar için snapping kontrolleri
        otherWidgets.forEach((otherWidget: {id: string; x: number; y: number; width: number; height: number}) => {
          // Yatay snapping - normal eşik değeri kullan
          
          // Sol kenar hizalama
          if (Math.abs(otherWidget.x - snappedPosition.x) < WIDGET_SNAP_THRESHOLD) {
            snappedPosition.x = otherWidget.x;
            newHelperLines.vertical = otherWidget.x;
          }
          
          // Sağ kenar hizalama - bu widget'ın sağ kenarı ile diğer widget'ın sol kenarı
          const currentWidgetRight = snappedPosition.x + widgetSize.width;
          if (Math.abs(currentWidgetRight - otherWidget.x) < WIDGET_SNAP_THRESHOLD) {
            snappedPosition.x = otherWidget.x - widgetSize.width;
            newHelperLines.vertical = otherWidget.x;
          }
          
          // Dikey snapping için daha düşük eşik değeri kullan
          const verticalThreshold = WIDGET_SNAP_THRESHOLD * VERTICAL_SNAP_MULTIPLIER;
          
          // Aşağı doğru sürükleme sırasında dikey snapping'i azalt
          if (isMovingDown) {
            // Aşağı doğru sürüklerken üst kenar hizalama için daha yüksek eşik (daha zor yapışır)
            if (Math.abs(otherWidget.y - snappedPosition.y) < verticalThreshold) {
              snappedPosition.y = otherWidget.y;
              newHelperLines.horizontal = otherWidget.y;
            }
          } else {
            // Normal sürükleme için standart snapping
            if (Math.abs(otherWidget.y - snappedPosition.y) < WIDGET_SNAP_THRESHOLD) {
              snappedPosition.y = otherWidget.y;
              newHelperLines.horizontal = otherWidget.y;
            }
          }
          
          // Alt kenar hizalama - bu widget'ın alt kenarı ile diğer widget'ın üst kenarı
          const currentWidgetBottom = snappedPosition.y + widgetSize.height;
          
          // Aşağı doğru sürükleme sırasında alt kenar hizalamayı azalt
          if (isMovingDown) {
            if (Math.abs(currentWidgetBottom - otherWidget.y) < verticalThreshold) {
              snappedPosition.y = otherWidget.y - widgetSize.height;
              newHelperLines.horizontal = otherWidget.y;
            }
          } else {
            if (Math.abs(currentWidgetBottom - otherWidget.y) < WIDGET_SNAP_THRESHOLD) {
              snappedPosition.y = otherWidget.y - widgetSize.height;
              newHelperLines.horizontal = otherWidget.y;
            }
          }
        });
      }
      
      // Güncellenen pozisyonları ve yardımcı çizgileri ayarla
      setWidgetHelperLines(newHelperLines);
      setWidgetPosition(snappedPosition);
      widgetPositionRef.current = snappedPosition;
    };
    
    const handleWidgetTouchMove = (e: TouchEvent) => {
      if (!isDraggingWidget || !e.touches[0]) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const newPosition = {
        x: touch.clientX - widgetDragStart.x,
        y: touch.clientY - widgetDragStart.y
      };
      
      // Sınırları uygula - Widget'ın dışarı çıkmasını engelle
      // Sol sınır (menü genişliği)
      newPosition.x = Math.max(BOUNDARY.LEFT, newPosition.x);
      
      // Üst sınır (sekme alanı yüksekliği)
      newPosition.y = Math.max(BOUNDARY.TOP, newPosition.y);
      
      // Sağ sınır (pencere genişliğini dikkate alarak)
      const windowWidth = window.innerWidth - BOUNDARY.RIGHT;
      
      // Sadece sağ sınırı uygula, alt sınırı uygulamıyoruz (aşağı kaydırma için)
      newPosition.x = Math.min(newPosition.x, windowWidth - widgetSize.width);
      
      // Dokunmatik olaylar için sayfa kaydırma
      // Dokunulan nokta ekranın alt kısmına yakınsa
      const viewportHeight = window.innerHeight;
      const touchPositionInViewport = touch.clientY;
      const scrollThreshold = 50; // Alt kenardan 50px içinde ise kaydır
      
      if (touchPositionInViewport > viewportHeight - scrollThreshold &&
          newPosition.y > widgetPosition.y) {
        // Sayfayı aşağı kaydır
        window.scrollBy(0, 5); // Mobile için daha yumuşak kaydırma
        
        // Widget'ın alt kenarını hesapla (ekran koordinatları + scroll)
        const widgetBottom = newPosition.y + widgetSize.height + window.scrollY;
        
        // Sayfa yüksekliğini artır
        const body = document.body;
        
        // Widget'ın alt kenarı + 100px boşluk bırak
        const neededHeight = widgetBottom + 100;
        
        // Mevcut yükseklikten daha fazlaysa ayarla
        if (neededHeight > body.offsetHeight) {
          body.style.minHeight = neededHeight + 'px';
        }
      }
      
      // Grid'e snapping - 20px grid'e snap et
      const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
      const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
      
      let snappedPosition = { ...newPosition };
      let newHelperLines: {vertical: number | undefined, horizontal: number | undefined} = { vertical: undefined, horizontal: undefined };
      
      // Dokunmatik olay için hareket yönünü belirle
      const isMovingDown = newPosition.y > widgetPosition.y;
      const isMovingUp = newPosition.y < widgetPosition.y;
      
      // Grid snapping - yatay için normal
      if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD) {
        snappedPosition.x = gridSnappedX;
        newHelperLines.vertical = gridSnappedX;
      }
      
      // Grid snapping - dikey için hareket yönüne göre ayarla
      const verticalGridThreshold = isMovingDown ?
        SNAP_THRESHOLD * VERTICAL_SNAP_MULTIPLIER : // Aşağı hareket ediyorsa daha az yapışkan
        SNAP_THRESHOLD; // Diğer durumlarda normal yapışkanlık
        
      if (Math.abs(gridSnappedY - newPosition.y) < verticalGridThreshold) {
        snappedPosition.y = gridSnappedY;
        newHelperLines.horizontal = gridSnappedY;
      }
      
      // Diğer widget'lara snapping benzer şekilde uygulanabilir (mobile için)
      
      // Güncellenen pozisyonları ve yardımcı çizgileri ayarla
      setWidgetHelperLines(newHelperLines);
      setWidgetPosition(snappedPosition);
      widgetPositionRef.current = snappedPosition;
    };
    
    const handleWidgetMouseUp = () => {
      if (!isDraggingWidget) return;
      setIsDraggingWidget(false);
      
      // Yardımcı çizgileri temizle
      setWidgetHelperLines({ vertical: undefined, horizontal: undefined });
      
      // Widget pozisyonunu veritabanına kaydet
      if (onWidgetPositionChange && id) {
        onWidgetPositionChange(id, widgetPositionRef.current);
      }
      
      // Widget pozisyonu değiştiğinde sayfa yüksekliğini ayarla
      // setTimeout ile geciktirerek DOM güncellemelerinin tamamlanmasını bekle
      setTimeout(adjustPageHeight, 50);
    };
    
    const handleWidgetTouchEnd = () => {
      if (!isDraggingWidget) return;
      setIsDraggingWidget(false);
      
      // Widget pozisyonunu veritabanına kaydet
      if (onWidgetPositionChange && id) {
        onWidgetPositionChange(id, widgetPositionRef.current);
      }
      
      // Widget pozisyonu değiştiğinde sayfa yüksekliğini ayarla
      setTimeout(adjustPageHeight, 50);
    };
    
    if (isDraggingWidget) {
      document.addEventListener('mousemove', handleWidgetMouseMove);
      document.addEventListener('mouseup', handleWidgetMouseUp);
      document.addEventListener('touchmove', handleWidgetTouchMove as EventListener);
      document.addEventListener('touchend', handleWidgetTouchEnd);
    } else {
      document.removeEventListener('mousemove', handleWidgetMouseMove);
      document.removeEventListener('mouseup', handleWidgetMouseUp);
      document.removeEventListener('touchmove', handleWidgetTouchMove as EventListener);
      document.removeEventListener('touchend', handleWidgetTouchEnd);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleWidgetMouseMove);
      document.removeEventListener('mouseup', handleWidgetMouseUp);
      document.removeEventListener('touchmove', handleWidgetTouchMove as EventListener);
      document.removeEventListener('touchend', handleWidgetTouchEnd);
    };
  }, [isDraggingWidget, widgetDragStart, id, onWidgetPositionChange]);
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
  const [isEditLabelModalOpen, setIsEditLabelModalOpen] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState<Register | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Register | null>(null);
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
      if (register.dataType === "label") {
        // Eğer düzenlenen öğe bir etiket ise, EditLabelModal'ı aç
        setSelectedLabel(register);
        setIsEditLabelModalOpen(true);
      } else {
        // Normal bir register ise, EditRegisterModal'ı aç
        setSelectedRegister(register);
        setIsEditRegisterModalOpen(true);
      }
    }
  };
  
  // Handle label update
  const handleUpdateLabel = async (updatedLabel: any) => {
    if (!id) return;
    
    try {
      console.log("Updating label with data:", updatedLabel);
      
      // Mevcut registers listesini al
      const currentRegisters = [...registers];
      
      // Güncellenecek etiketin index'ini bul
      const labelIndex = currentRegisters.findIndex(reg => reg.id === updatedLabel.id);
      
      if (labelIndex === -1) {
        console.error("Label not found in the list:", updatedLabel.id);
        return;
      }
      
      // Etiketi güncelle
      const updatedLabelData = {
        ...currentRegisters[labelIndex],
        label: updatedLabel.label,
        labelSize: updatedLabel.labelSize
      };
      
      // Yerelde registers dizisini güncelle
      currentRegisters[labelIndex] = updatedLabelData;
      
      // State'leri güncelle
      if (updatedLabel.labelSize) {
        setLabelSizes(prev => ({...prev, [updatedLabel.id]: updatedLabel.labelSize}));
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
      
      console.log("Label updated successfully");
      
      // Parent'a bildir
      if (onRegisterUpdate) {
        onRegisterUpdate(id, updatedLabel.id, updatedLabelData);
      }
    } catch (error) {
      console.error("Error updating label:", error);
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
      
      // Parent'a bildir
      if (onRegisterUpdate) {
        onRegisterUpdate(id, updatedRegister.id, updatedRegisterData);
      }
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
      
      // Etiket için gerekli minimum alanları içeren nesne oluştur
      // dataType korunuyor, diğer gereksiz alanlar kaldırıldı
      const newLabel = {
        id: labelId,
        label: newLabelData.text,
        labelPosition: dropPosition,
        labelSize: labelSize, // Açıkça belirtilen veya varsayılan boyut değerini kullan
        dataType: "label" // Etiketleri ayırt etmek için dataType gerekli
      };
      
      // API'ye kaydetmek için sadece gerekli alanları içeren etiket nesnesini ekle
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
          // Bir etiket mi (analyzerId olmayan) yoksa normal register mı olduğunu kontrol et
          if (!reg.analyzerId) {
            // Bu bir etiket, sadece etiket özelliklerini güncelle
            return {
              ...reg,
              labelPosition: labelPositions[reg.id] || reg.labelPosition,
              labelSize: labelSizes[reg.id] || reg.labelSize
            };
          } else {
            // Bu normal bir register, normal özellikleri güncelle
            return {
              ...reg,
              valuePosition: valuePositions[reg.id] || reg.valuePosition,
              valueSize: valueSizes[reg.id] || reg.valueSize
            };
          }
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
      <>
        {/* Yardımcı çizgiler */}
        {widgetHelperLines.vertical !== undefined &&
          <div className="absolute top-0 h-full w-[1px] bg-blue-500 pointer-events-none z-50"
               style={{ left: `${widgetHelperLines.vertical}px` }} />
        }
        {widgetHelperLines.horizontal !== undefined &&
          <div className="absolute left-0 w-full h-[1px] bg-blue-500 pointer-events-none z-50"
               style={{ top: `${widgetHelperLines.horizontal}px` }} />
        }
        
        <div
          data-widget-id={id}
          className="widget-container bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 relative group border border-transparent hover:border-blue-500 transition-all duration-300"
          style={{
            width: `${widgetSize.width}px`,
            height: `${widgetSize.height}px`,
            position: 'absolute',
            left: widgetPosition.x,
            top: widgetPosition.y,
            zIndex: isDraggingWidget ? 100 : 1,
            transition: isDraggingWidget ? 'none' : 'box-shadow 0.2s ease',
            boxShadow: isDraggingWidget ? '0 10px 25px rgba(0, 0, 0, 0.15)' : ''
          }}
        >
        {/* Render modals in a portal */}
        {ReactDOM.createPortal(
          <>
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
            
            <EditLabelModal
                isOpen={isEditLabelModalOpen}
                onClose={() => setIsEditLabelModalOpen(false)}
                onConfirm={handleUpdateLabel}
                label={selectedLabel}
            />
          </>,
          document.body
        )}
          <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30">
              <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <PencilSquareIcon className="h-5 w-5" />
              </button>
              <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <TrashIcon className="h-5 w-5" />
              </button>
          </div>
        
          <h3
            className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center tracking-wider select-none"
            style={{
              cursor: isDraggingWidget ? 'grabbing' : 'grab',
              padding: '8px 12px',
              marginTop: '-8px',
              marginLeft: '-12px',
              marginRight: '-12px',
              borderTopLeftRadius: '0.75rem',
              borderTopRightRadius: '0.75rem',
              backgroundColor: 'rgba(0, 0, 0, 0.03)',
              borderBottom: '1px solid rgba(0, 0, 0, 0.05)'
            }}
            onMouseDown={handleWidgetMouseDown}
            onTouchStart={handleWidgetTouchStart}
          >{title}</h3>
        
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
                // Etiket kontrolü - dataType='label' veya analyzerId olmayan kayıtlar
                const isLabel = (reg.dataType === "label" || !reg.analyzerId) && labelPositions[reg.id];
                // Normal register kontrolü - analyzerId olan ve valuePosition olan kayıtlar
                const isRegister = reg.analyzerId && valuePositions[reg.id];
                
                if (!isLabel && !isRegister) return null;
                
                return (
                  <React.Fragment key={registerKey}>
                    {isLabel && (
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
                    {isRegister && (
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
      </>
  );
};

export const RegisterWidget: React.FC<RegisterWidgetProps> = (props) => (
    <WidgetDnDProvider>
        <WidgetContent {...props} />
    </WidgetDnDProvider>
);
