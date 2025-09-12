"use client";

import { useState, useRef, useEffect } from 'react';
import { ChevronRightIcon, PlusCircleIcon, PhotoIcon, Bars3BottomLeftIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import { useWidgetDnD } from '@/context/WidgetDnDContext';
import { useAuth } from '@/hooks/use-auth';

export const WidgetToolbar: React.FC = () => {
  const { setDraggedType } = useWidgetDnD();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const { isAdmin } = useAuth();

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;

    setIsDragging(true);

    if (toolbarRef.current) {
        const rect = toolbarRef.current.getBoundingClientRect();
        dragOffsetRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !toolbarRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();

    const parentRect = toolbarRef.current.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    let newX = e.clientX - parentRect.left - dragOffsetRef.current.x;
    let newY = e.clientY - parentRect.top - dragOffsetRef.current.y;

    const toolbarWidth = toolbarRef.current.offsetWidth;
    const toolbarHeight = toolbarRef.current.offsetHeight;

    newX = Math.max(0, Math.min(newX, parentRect.width - toolbarWidth));
    newY = Math.max(0, Math.min(newY, parentRect.height - toolbarHeight));

    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Admin değilse toolbar gösterme
  if (!isAdmin && !window.isAdmin) {
    return null;
  }

  return (
    <div
      ref={toolbarRef}
      className="absolute z-20 flex flex-col items-center bg-white dark:bg-gray-800 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 group transition-all duration-200 ease-in-out hover:p-2 hover:space-y-2 p-1"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      <div 
        onMouseDown={handleMouseDown}
        className="cursor-grab active:cursor-grabbing p-1"
        >
        <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 transform transition-transform duration-300 group-hover:rotate-180" />
      </div>

      <div
        className="flex flex-col items-center space-y-2 transition-all duration-300 ease-in-out overflow-hidden max-h-0 opacity-0 group-hover:max-h-96 group-hover:opacity-100"
      >
        <div 
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('application/widget-item', 'register'); setDraggedType('register');}}
          onDragEnd={() => setDraggedType(null)}
          className="p-2 rounded-md cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Add Register"
        >
            <PlusCircleIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
        </div>
        <div 
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('application/widget-item', 'label'); setDraggedType('label');}}
          onDragEnd={() => setDraggedType(null)}
          className="p-2 rounded-md cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Add Label"
        >
            <Bars3BottomLeftIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
        </div>
        
        {/* Placeholder for other tools */}
        <div className="p-2 rounded-md cursor-not-allowed" title="Add Image (Coming Soon)">
            <PhotoIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
        </div>
         <div className="p-2 rounded-md cursor-not-allowed" title="Add Table (Coming Soon)">
            <TableCellsIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
        </div>
      </div>
    </div>
  );
};