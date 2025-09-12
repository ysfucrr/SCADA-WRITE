"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showToast } from "../ui/alert";
import { Typography } from '@/components/ui/typography';
import Slider from "@/components/ui/slider";

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

          {/* Appearance Settings */}
          <div className="mt-6">
            <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
              Appearance Settings
            </Typography>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fontFamily">Font Family</Label>
                <select
                  id="fontFamily"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="text-black dark:text-white flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white dark:[&>option]:bg-slate-800 dark:[&>option]:text-white"
                  style={{ colorScheme: 'auto' }}
                >
                  <option value="Arial, sans-serif" style={{ fontFamily: 'Arial, sans-serif' }}>Arial</option>
                  <option value="Verdana, sans-serif" style={{ fontFamily: 'Verdana, sans-serif' }}>Verdana</option>
                  <option value="Helvetica, sans-serif" style={{ fontFamily: 'Helvetica, sans-serif' }}>Helvetica</option>
                  <option value="Times New Roman, serif" style={{ fontFamily: 'Times New Roman, serif' }}>Times New Roman</option>
                  <option value="Georgia, serif" style={{ fontFamily: 'Georgia, serif' }}>Georgia</option>
                  <option value="Courier New, monospace" style={{ fontFamily: 'Courier New, monospace' }}>Courier New</option>
                  <option value="Trebuchet MS, sans-serif" style={{ fontFamily: 'Trebuchet MS, sans-serif' }}>Trebuchet MS</option>
                  <option value="Impact, sans-serif" style={{ fontFamily: 'Impact, sans-serif' }}>Impact</option>
                  <option value="Seven Segment" style={{ fontFamily: 'Seven Segment' }}>Seven Segment</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="textColor">Text Color</Label>
                <Input
                  id="textColor"
                  type="color"
                  value={fontColor}
                  onChange={(e) => setFontColor(e.target.value)}
                  className="w-full h-10 p-1"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="backgroundColor">Background Color</Label>
                <Input
                  id="backgroundColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-full h-10 p-1"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="opacity">Background Opacity</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    id="opacity"
                    min={0}
                    max={100}
                    value={opacity}
                    onChange={setOpacity}
                    className="flex-1"
                  />
                  <span className="w-16 text-center text-black dark:text-white">{opacity}%</span>
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