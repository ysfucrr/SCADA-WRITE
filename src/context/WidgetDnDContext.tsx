"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DropPosition {
  x: number;
  y: number;
}

interface WidgetDnDContextType {
  draggedType: string | null;
  setDraggedType: (type: string | null) => void;
  dropPosition: DropPosition | null;
  setDropPosition: (position: DropPosition | null) => void;
}

const WidgetDnDContext = createContext<WidgetDnDContextType | undefined>(undefined);

export const useWidgetDnD = () => {
  const context = useContext(WidgetDnDContext);
  if (!context) {
    throw new Error('useWidgetDnD must be used within a WidgetDnDProvider');
  }
  return context;
};

interface WidgetDnDProviderProps {
  children: ReactNode;
}

export const WidgetDnDProvider: React.FC<WidgetDnDProviderProps> = ({ children }) => {
  const [draggedType, setDraggedType] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);

  const value = {
    draggedType,
    setDraggedType,
    dropPosition,
    setDropPosition,
  };

  return (
    <WidgetDnDContext.Provider value={value}>
      {children}
    </WidgetDnDContext.Provider>
  );
};