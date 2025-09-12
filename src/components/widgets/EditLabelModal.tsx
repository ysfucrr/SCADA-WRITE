"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showToast } from "../ui/alert";

interface EditLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updatedLabelData: any) => void;
  label: {
    id: string;
    label: string;
    labelSize?: { width: number, height: number };
  } | null;
}

export const EditLabelModal: React.FC<EditLabelModalProps> = ({ isOpen, onClose, onConfirm, label }) => {
  const [labelText, setLabelText] = useState("");
  const [labelSize, setLabelSize] = useState({ width: 100, height: 30 });

  useEffect(() => {
    if (label && isOpen) {
      setLabelText(label.label || "");
      setLabelSize(label.labelSize || { width: 100, height: 30 });
    }
  }, [label, isOpen]);

  const handleConfirm = () => {
    if (!label) return;
    
    if (!labelText) {
      showToast("Label text cannot be empty.", "error");
      return;
    }
    
    // Güncellenmiş etiket verisini hazırla
    const updatedLabel = {
      ...label,
      label: labelText,
      labelSize: labelSize
    };
    
    onConfirm(updatedLabel);
    onClose();
  };

  if (!label) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-md">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">Edit Label</h3>
        
        <div className="space-y-4">
            <div>
                <Label htmlFor="labelText" className="text-sm font-medium text-gray-700 dark:text-gray-300">Label Text</Label>
                <Input
                    id="labelText"
                    type="text"
                    value={labelText}
                    onChange={(e) => setLabelText(e.target.value)}
                    className="mt-1"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                     <Label htmlFor="labelWidth" className="text-sm font-medium text-gray-700 dark:text-gray-300">Width (px)</Label>
                     <Input
                         id="labelWidth"
                         type="number"
                         value={labelSize.width}
                         onChange={(e) => setLabelSize(s => ({ ...s, width: Number(e.target.value) || 0 }))}
                         className="mt-1"
                     />
                </div>
                <div>
                     <Label htmlFor="labelHeight" className="text-sm font-medium text-gray-700 dark:text-gray-300">Height (px)</Label>
                     <Input
                         id="labelHeight"
                         type="number"
                         value={labelSize.height}
                         onChange={(e) => setLabelSize(s => ({ ...s, height: Number(e.target.value) || 0 }))}
                         className="mt-1"
                     />
                </div>
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};