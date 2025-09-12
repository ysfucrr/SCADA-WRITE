"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { showToast } from "../ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Slider from "@/components/ui/slider";
import { Typography } from '@/components/ui/typography';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (widgetTitle: string, widgetSize: { width: number, height: number }, appearance: WidgetAppearance) => void;
}

// Interface for appearance settings
interface WidgetAppearance {
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  opacity: number;
}

const fontFamilies = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: 'Seven Segment', label: 'Seven Segment' },
];

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetSize, setWidgetSize] = useState({ width: 300, height: 400 });
  
  // Appearance settings
  const [fontFamily, setFontFamily] = useState<string>('Arial, sans-serif');
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [opacity, setOpacity] = useState<number>(100);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setWidgetTitle("");
      setWidgetSize({ width: 300, height: 400 });
      setFontFamily('Arial, sans-serif');
      setTextColor('#ffffff');
      setBackgroundColor('#000000');
      setOpacity(100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!widgetTitle) {
      showToast("Please enter a widget name.", "error");
      return;
    }
    
    const appearance: WidgetAppearance = {
      fontFamily,
      textColor,
      backgroundColor,
      opacity
    };
    
    onConfirm(widgetTitle, widgetSize, appearance);
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
                    {fontFamilies.map((font) => (
                      <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="textColor">Text Color</Label>
                  <Input
                    id="textColor"
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
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

        <div className="flex justify-end gap-3 mt-8">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Create Widget</Button>
        </div>
      </div>
    </Modal>
  );
};