"use client";

import React, { useState } from "react";
import { DoorOpen, PencilIcon, TrashIcon } from "lucide-react";
import { Room } from "@/types/units";
import { IconButton } from "@/components/ui/icon-button";
import Image from "next/image";
import IconUploader from "@/components/ui/IconUploader";

interface RoomItemProps {
  room: Room;
  floorId: string;
  onEdit: (roomId: string, newName: string) => void;
  onDelete: (roomId: string) => void;
  onIconChange?: (roomId: string, iconPath: string | null) => Promise<void>;
}

const RoomItem: React.FC<RoomItemProps> = ({ room, floorId, onEdit, onDelete, onIconChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(room.name);

  const handleSave = () => {
    if (editedName && editedName.trim() && editedName !== room.name) {
      onEdit(room._id!, editedName);
    }
    setIsEditing(false);
  };

  return (
    <div className="cursor-pointer flex items-center justify-between rounded-md bg-white p-2 shadow-sm dark:bg-gray-800">
      <div className="flex items-center gap-2">
        {onIconChange ? (
          <IconUploader
            currentIcon={room.icon}
            defaultIcon={<DoorOpen />}
            onIconChange={(iconPath) => onIconChange(room._id!, iconPath)}
            size="sm"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
            {room.icon ? (
              <div className="relative h-6 w-6">
                <Image
                  src={room.icon}
                  alt={room.name || "Room"}
                  fill
                  className="object-contain p-1"
                />
              </div>
            ) : (
              <DoorOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            )}
          </div>
        )}
        
        {isEditing ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
            autoFocus
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setEditedName(room.name);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <span className="text-sm text-gray-700 dark:text-gray-300">{room.name}</span>
        )}
      </div>
      
      <div className="flex space-x-1">
        <IconButton
          onClick={() => setIsEditing(true)}
          variant="warning"
          // color="warning"
          size="sm"
          icon={<PencilIcon className="h-3.5 w-3.5" />}
        />
        <IconButton
          onClick={() => onDelete(room._id!)}
          variant="error"
          // color="error"
          size="sm"
          icon={<TrashIcon className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  );
};

export default RoomItem;
