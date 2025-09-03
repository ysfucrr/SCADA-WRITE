"use client";

import React, { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, Layers, PencilIcon, TrashIcon } from "lucide-react";
import { Floor, Room } from "@/types/units";
import RoomItem from "./RoomItem";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button/CustomButton";
import Image from "next/image";
import IconUploader from "@/components/ui/IconUploader";

interface FloorCardProps {
  floor: Floor;
  onEdit: (floorId: string) => void;
  onDelete: (floorId: string) => void;
  onAddRoom: (floorId: string, roomName: string) => void;
  onEditRoom: (floorId: string, roomId: string, newName: string) => void;
  onDeleteRoom: (floorId: string, roomId: string) => void;
  onIconChange?: (floorId: string, iconPath: string | null) => Promise<void>;
  onRoomIconChange?: (floorId: string, roomId: string, iconPath: string | null) => Promise<void>;
}

const FloorCard: React.FC<FloorCardProps> = ({
  floor,
  onEdit,
  onDelete,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
  onIconChange,
  onRoomIconChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newRoomName, setNewRoomName] = useState("");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  const handleAddRoom = () => {
    if (newRoomName.trim()) {
      onAddRoom(floor._id!, newRoomName);
      setNewRoomName("");
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between bg-gray-50 p-3 dark:bg-gray-800/50">
        <div className="flex items-center gap-3">
          <IconButton
            onClick={() => setIsExpanded(!isExpanded)}
            variant="ghost"
            size="sm"
            shape="rounded"
            className="mr-2"
            icon={isExpanded ? (
              <ChevronUpIcon className="h-5 w-5" />
            ) : (
              <ChevronDownIcon className="h-5 w-5" />
            )}
          />
          {onIconChange ? (
            <IconUploader
              currentIcon={floor.icon}
              defaultIcon={<Layers />}
              onIconChange={(iconPath) => onIconChange(floor._id!, iconPath)}
              size="sm"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
              {floor.icon ? (
                <div className="relative h-8 w-8">
                  <Image
                    src={floor.icon}
                    alt={floor.name || "Floor"}
                    fill
                    className="object-contain p-1"
                  />
                </div>
              ) : (
                <Layers className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              )}
            </div>
          )}
          <h3 className="font-medium text-gray-800 dark:text-gray-200">{floor.name}</h3>
        </div>
        <div className="flex space-x-2">
          <IconButton
            onClick={() => onEdit(floor._id!)}
            variant="warning"
            // color="warning"
            size="sm"
            icon={<PencilIcon className="h-4 w-4" />}
          />
          <IconButton
            onClick={() => onDelete(floor._id!)}
            variant="error"
            // color="error"
            size="sm"
            icon={<TrashIcon className="h-4 w-4" />}
          />
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3">
          <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/30">
            <p className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Rooms</p>
            
            {floor.rooms && floor.rooms.length > 0 ? (
              <div className="mb-3 space-y-2">
                {floor.rooms.map((room) => (
                  <RoomItem
                    key={room._id}
                    room={room}
                    floorId={floor._id!}
                    onEdit={(roomId, newName) => onEditRoom(floor._id!, roomId, newName)}
                    onDelete={(roomId) => onDeleteRoom(floor._id!, roomId)}
                    onIconChange={onRoomIconChange ? (roomId, iconPath) => onRoomIconChange(floor._id!, roomId, iconPath) : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">No rooms yet</p>
            )}
            
            <form 
              className="mt-2 flex space-x-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newRoomName.trim()) {
                  handleAddRoom();
                }
              }}
            >
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Add new room"
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:border-blue-400"
              />
              <Button
                type="submit"
                disabled={!newRoomName.trim()}
                variant="primary"
                size="sm"
              >
                Add
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloorCard;
