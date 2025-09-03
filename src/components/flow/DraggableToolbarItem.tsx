import React from 'react';
import { useDnD } from './DnDContext';

interface DraggableToolbarItemProps {
  nodeType: string;
  label: string;
  icon: React.ReactNode;
}

export function DraggableToolbarItem({ nodeType, label, icon }: DraggableToolbarItemProps) {
  const { setNodeType } = useDnD();

  const onDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    setNodeType(nodeType);
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = () => {
    setNodeType(null);
  };

  return (
    <div
      className="flex items-center gap-2 p-2 h-8 hover:bg-gray-100 dark:hover:bg-gray-700 rounded w-full text-left text-gray-800 dark:text-white cursor-grab"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white">
        {icon}
      </div>
      <span className="hidden group-hover:block text-gray-800 dark:text-white">{label}</span>
    </div>
  );
}
