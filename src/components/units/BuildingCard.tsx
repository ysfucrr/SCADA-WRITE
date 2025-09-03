"use client";

import React from "react";
import { Building as BuildingIcon, PencilIcon, TrashIcon } from "lucide-react";
import { Building } from "@/types/units";
import { IconButton } from "@/components/ui/icon-button";
import Image from "next/image";
import IconUploader from "@/components/ui/IconUploader";

interface BuildingCardProps {
  building: Building;
  isActive: boolean;
  onSelect: (building: Building) => void;
  onEdit: (building: Building) => void;
  onDelete: (buildingId: string) => void;
  onIconChange?: (buildingId: string, iconPath: string | null) => Promise<void>;
}

const BuildingCard: React.FC<BuildingCardProps> = ({
  building,
  isActive,
  onSelect,
  onEdit,
  onDelete,
  onIconChange,
}) => {
  return (
    <div
      className={`mb-2 cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md ${
        isActive
          ? "border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/30"
      }`}
      onClick={() => onSelect(building)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onIconChange ? (
            <IconUploader
              currentIcon={building.icon}
              defaultIcon={<BuildingIcon />}
              onIconChange={(iconPath) => onIconChange(building._id!, iconPath)}
              size="md"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
              {building.icon ? (
                <div className="relative h-10 w-10">
                  <Image
                    src={building.icon}
                    alt={building.name || "Building"}
                    fill
                    className="object-contain p-1"
                  />
                </div>
              ) : (
                <BuildingIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
              )}
            </div>
          )}
          <div className="flex-1">
            <h3 className="font-medium text-gray-800 dark:text-gray-200">
              {building.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {building.floors?.length || 0} {building.floors?.length === 1 ? "floor" : "floors"}
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <IconButton
            onClick={() => {
              onEdit(building);
            }}
            variant="warning"
            // color="warning"
            size="sm"
            icon={<PencilIcon className="h-4 w-4" />}
          />
          <IconButton
            onClick={() => {
              if (building._id) {
                onDelete(building._id);
              }
            }}
            variant="error"
            // color="error"
            size="sm"
            icon={<TrashIcon className="h-4 w-4" />}
          />
        </div>
      </div>
    </div>
  );
};

export default BuildingCard;
