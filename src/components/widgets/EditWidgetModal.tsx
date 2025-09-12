"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showToast } from "../ui/alert";

interface EditWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string, newSize: { width: number, height: number }) => void;
  widget: {
    title: string;
    size: { width: number, height: number };
  } | null;
}

export const EditWidgetModal: React.FC<EditWidgetModalProps> = ({ isOpen, onClose, onConfirm, widget }) => {
  const [name, setName] = useState("");
  const [size, setSize] = useState({ width: 600, height: 400 });

  useEffect(() => {
    if (widget && isOpen) {
      setName(widget.title);
      setSize(widget.size);
    }
  }, [widget, isOpen]);

  const handleConfirm = () => {
    if (!name) {
      showToast("Widget name cannot be empty.", "error");
      return;
    }
    onConfirm(name, size);
    onClose();
  };

  if (!widget) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-md">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">Edit Widget Details</h3>
        
        <div className="space-y-4">
            <div>
                <Label htmlFor="widgetName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Name</Label>
                <Input
                    id="widgetName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                     <Label htmlFor="widgetWidth" className="text-sm font-medium text-gray-700 dark:text-gray-300">Width (px)</Label>
                     <Input
                         id="widgetWidth"
                         type="number"
                         value={size.width}
                         onChange={(e) => setSize(s => ({ ...s, width: Number(e.target.value) || 0 }))}
                         className="mt-1"
                     />
                </div>
                <div>
                     <Label htmlFor="widgetHeight" className="text-sm font-medium text-gray-700 dark:text-gray-300">Height (px)</Label>
                     <Input
                         id="widgetHeight"
                         type="number"
                         value={size.height}
                         onChange={(e) => setSize(s => ({ ...s, height: Number(e.target.value) || 0 }))}
                         className="mt-1"
                     />
                </div>
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  );
};