"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  DocumentTextIcon, 
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import { useWidgetDnD } from '@/context/WidgetDnDContext';
import { useAuth } from '@/hooks/use-auth';

export const GlobalWidgetToolbar: React.FC = () => {
  const { setDraggedType } = useWidgetDnD();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 900, y: 100 });
  const [isOpen, setIsOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

    // Sayfa genelinde konumlandırmak için document.body kullanılıyor
    const bodyRect = document.body.getBoundingClientRect();
    
    let newX = e.clientX - bodyRect.left - dragOffsetRef.current.x;
    let newY = e.clientY - bodyRect.top - dragOffsetRef.current.y;

    const toolbarWidth = toolbarRef.current.offsetWidth;
    const toolbarHeight = toolbarRef.current.offsetHeight;

    // Toolbar'ın viewport içinde kalmasını sağlama
    newX = Math.max(0, Math.min(newX, window.innerWidth - toolbarWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - toolbarHeight));

    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  // Menü dışında bir yere tıklandığında menüyü kapat
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node) && isOpen) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDragging, isOpen]);

  // Admin değilse toolbar gösterme
  if (!isAdmin && !window.isAdmin) {
    return null;
  }

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col items-center bg-white dark:bg-gray-800 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* Başlık kısmı - sürüklemek için kullanılabilir */}
      <div 
        onMouseDown={handleMouseDown}
        className="w-full bg-blue-500 text-white px-4 py-2 rounded-t-lg cursor-grab active:cursor-grabbing flex justify-center"
      >
        <span className="font-medium">Tools</span>
      </div>

      {/* Menü */}
      <div ref={menuRef} className="w-full">
        {/* Menü Öğeleri */}
        <div className="p-2 space-y-1">
          <div 
            className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
            draggable
            onDragStart={(e) => { 
              e.dataTransfer.setData('application/widget-item', 'label'); 
              setDraggedType('label');
            }}
            onDragEnd={() => setDraggedType(null)}
          >
            <DocumentTextIcon className="h-5 w-5 mr-3 text-gray-600 dark:text-gray-300" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Text</span>
          </div>
          
          <div 
            className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
            draggable
            onDragStart={(e) => { 
              e.dataTransfer.setData('application/widget-item', 'register'); 
              setDraggedType('register');
            }}
            onDragEnd={() => setDraggedType(null)}
          >
            <PencilSquareIcon className="h-5 w-5 mr-3 text-gray-600 dark:text-gray-300" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Register</span>
          </div>
        </div>
      </div>
    </div>
  );
};