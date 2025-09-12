"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { showToast } from "../ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (widgetTitle: string, widgetSize: { width: number, height: number }) => void;
}

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetSize, setWidgetSize] = useState({ width: 300, height: 400 });

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setWidgetTitle("");
      setWidgetSize({ width: 300, height: 400 });
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!widgetTitle) {
      showToast("Please enter a widget name.", "error");
      return;
    }
    
    onConfirm(widgetTitle, widgetSize);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-xl">
      <div className="p-8">
        <h3 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Add New Widget</h3>
        
        <div className="space-y-6">
            <div>
                <Label htmlFor="widgetName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Name</Label>
                <Input
                    id="widgetName"
                    type="text"
                    value={widgetTitle}
                    onChange={(e) => setWidgetTitle(e.target.value)}
                    placeholder="e.g., Energy Consumption"
                    className="mt-1"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                     <Label htmlFor="widgetWidth" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Width (px)</Label>
                     <Input
                         id="widgetWidth"
                         type="number"
                         value={widgetSize.width || 300}
                         onChange={(e) => {
                           const newWidth = e.target.value === '' ? 300 : Number(e.target.value);
                           if (newWidth > 0) {
                             setWidgetSize(s => ({...s, width: newWidth}));
                           }
                         }}
                         placeholder="e.g., 300"
                         className="mt-1"
                         min="1"
                     />
                </div>
                <div>
                     <Label htmlFor="widgetHeight" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Height (px)</Label>
                     <Input
                         id="widgetHeight"
                         type="number"
                         value={widgetSize.height || 400}
                         onChange={(e) => {
                           const newHeight = e.target.value === '' ? 400 : Number(e.target.value);
                           if (newHeight > 0) {
                             setWidgetSize(s => ({...s, height: newHeight}));
                           }
                         }}
                         placeholder="e.g., 400"
                         className="mt-1"
                         min="1"
                     />
                </div>
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Create Widget</Button>
        </div>
      </div>
    </Modal>
  );
};