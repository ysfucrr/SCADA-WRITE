"use client";

import React, { useState, useEffect } from "react";
import { Floor } from "@/types/units";
import { Button, OutlineButton } from "@/components/ui/button/CustomButton";

interface FloorFormProps {
  isEditing: boolean;
  floor?: Floor | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

const FloorForm: React.FC<FloorFormProps> = ({ 
  isEditing, 
  floor, 
  onSubmit, 
  onCancel 
}) => {
  const [name, setName] = useState("");
  
  useEffect(() => {
    if (isEditing && floor) {
      setName(floor.name!);
    } else {
      setName("");
    }
  }, [floor, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name);
      setName("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3">
      <div>
        <label htmlFor="floorName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Floor Name
        </label>
        <input
          type="text"
          id="floorName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          placeholder="Enter floor name"
          autoFocus
        />
      </div>
      
      <div className="flex justify-end space-x-2 pt-2">
        <OutlineButton
          type="button"
          onClick={onCancel}
          size="sm"
          variant="secondary"
        >
          Cancel
        </OutlineButton>
        <Button
          type="submit"
          disabled={!name.trim()}
          variant="primary"
          size="sm"
        >
          {isEditing ? "Update" : "Add"}
        </Button>
      </div>
    </form>
  );
};

export default FloorForm;
