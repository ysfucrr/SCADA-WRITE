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
    fontFamily?: string;
    fontColor?: string;
    backgroundColor?: string;
    opacity?: number;
  } | null;
}

export const EditLabelModal: React.FC<EditLabelModalProps> = ({ isOpen, onClose, onConfirm, label }) => {
  const [labelText, setLabelText] = useState("");
  const [labelSize, setLabelSize] = useState({ width: 100, height: 30 });
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontColor, setFontColor] = useState("#000000");
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [opacity, setOpacity] = useState(100);

  useEffect(() => {
    if (label && isOpen) {
      setLabelText(label.label || "");
      setLabelSize(label.labelSize || { width: 100, height: 30 });
      setFontFamily(label.fontFamily || "Arial");
      setFontColor(label.fontColor || "#000000");
      setBackgroundColor(label.backgroundColor || "#FFFFFF");
      setOpacity(label.opacity !== undefined ? label.opacity : 100);
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
      labelSize: labelSize,
      fontFamily,
      fontColor,
      backgroundColor,
      opacity
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
            
            <div className="space-y-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Appearance Settings</h4>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="fontFamily" className="text-sm font-medium text-gray-700 dark:text-gray-300">Font Family</Label>
                        <select
                            id="fontFamily"
                            value={fontFamily}
                            onChange={(e) => setFontFamily(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="Arial">Arial</option>
                            <option value="Helvetica">Helvetica</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Verdana">Verdana</option>
                            <option value="Georgia">Georgia</option>
                            <option value="Palatino">Palatino</option>
                            <option value="Garamond">Garamond</option>
                            <option value="Bookman">Bookman</option>
                            <option value="Comic Sans MS">Comic Sans MS</option>
                            <option value="Trebuchet MS">Trebuchet MS</option>
                            <option value="Arial Black">Arial Black</option>
                            <option value="Impact">Impact</option>
                            <option value="Tahoma">Tahoma</option>
                        </select>
                    </div>
                    
                    <div>
                        <Label htmlFor="opacity" className="text-sm font-medium text-gray-700 dark:text-gray-300">Opacity (%)</Label>
                        <Input
                            id="opacity"
                            type="number"
                            min="0"
                            max="100"
                            value={opacity}
                            onChange={(e) => setOpacity(Number(e.target.value))}
                            className="mt-1"
                        />
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                        <Label htmlFor="fontColor" className="text-sm font-medium text-gray-700 dark:text-gray-300">Font Color</Label>
                        <div className="flex mt-1">
                            <Input
                                id="fontColor"
                                type="color"
                                value={fontColor}
                                onChange={(e) => setFontColor(e.target.value)}
                                className="w-12 h-9 p-1 mr-2"
                            />
                            <Input
                                type="text"
                                value={fontColor}
                                onChange={(e) => setFontColor(e.target.value)}
                                className="flex-1"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <Label htmlFor="backgroundColor" className="text-sm font-medium text-gray-700 dark:text-gray-300">Background Color</Label>
                        <div className="flex mt-1">
                            <Input
                                id="backgroundColor"
                                type="color"
                                value={backgroundColor}
                                onChange={(e) => setBackgroundColor(e.target.value)}
                                className="w-12 h-9 p-1 mr-2"
                            />
                            <Input
                                type="text"
                                value={backgroundColor}
                                onChange={(e) => setBackgroundColor(e.target.value)}
                                className="flex-1"
                            />
                        </div>
                    </div>
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