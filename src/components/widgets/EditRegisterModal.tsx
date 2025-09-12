"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showToast } from "../ui/alert";

interface EditRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updatedRegisterData: any) => void;
  register: {
    id: string;
    label?: string;
    analyzerName?: string;
    analyzerId?: string;
    address?: number;
    dataType?: string;
    bit?: number;
    valueSize?: { width: number, height: number };
    labelSize?: { width: number, height: number };
    fontFamily?: string;
    fontColor?: string;
    backgroundColor?: string;
    opacity?: number;
  } | null;
}

export const EditRegisterModal: React.FC<EditRegisterModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  register 
}) => {
  const [registerLabel, setRegisterLabel] = useState("");
  const [valueSize, setValueSize] = useState({ width: 120, height: 80 });
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontColor, setFontColor] = useState("#000000");
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [opacity, setOpacity] = useState(100);

  useEffect(() => {
    if (register && isOpen) {
      setRegisterLabel(register.label || "");
      setValueSize(register.valueSize || { width: 120, height: 80 });
      setFontFamily(register.fontFamily || "Arial");
      setFontColor(register.fontColor || "#000000");
      setBackgroundColor(register.backgroundColor || "#FFFFFF");
      setOpacity(register.opacity !== undefined ? register.opacity : 100);
    }
  }, [register, isOpen]);

  const handleConfirm = () => {
    if (!register) return;
    
    // Güncellenmiş register verisini hazırla
    const updatedRegister = {
      ...register,
      label: registerLabel,
      valueSize: valueSize,
      fontFamily,
      fontColor,
      backgroundColor,
      opacity
    };
    
    onConfirm(updatedRegister);
    onClose();
  };

  if (!register) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-md">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">Edit Register</h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="registerLabel" className="text-sm font-medium text-gray-700 dark:text-gray-300">Register Label</Label>
            <Input
              id="registerLabel"
              type="text"
              value={registerLabel}
              onChange={(e) => setRegisterLabel(e.target.value)}
              className="mt-1"
            />
          </div>
          
          {register.dataType !== "label" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="valueWidth" className="text-sm font-medium text-gray-700 dark:text-gray-300">Value Width (px)</Label>
                <Input
                  id="valueWidth"
                  type="number"
                  value={valueSize.width}
                  onChange={(e) => setValueSize(s => ({ ...s, width: Number(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="valueHeight" className="text-sm font-medium text-gray-700 dark:text-gray-300">Value Height (px)</Label>
                <Input
                  id="valueHeight"
                  type="number"
                  value={valueSize.height}
                  onChange={(e) => setValueSize(s => ({ ...s, height: Number(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          
          {register.dataType !== "label" && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 dark:bg-gray-700/30 dark:border-gray-600">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Analyzer Name</Label>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{register.analyzerName || register.analyzerId}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Address</Label>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{register.address}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Data Type</Label>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{register.dataType}</p>
                </div>
                {register.bit !== undefined && (
                  <div>
                    <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Bit</Label>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{register.bit}</p>
                  </div>
                )}
              </div>
            </div>
          )}

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