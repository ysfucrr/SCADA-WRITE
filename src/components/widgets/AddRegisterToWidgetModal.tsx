"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Select from "react-select";
import { showToast } from "../ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Typography } from '@/components/ui/typography';
import Slider from "@/components/ui/slider";

// Interface for appearance settings
interface RegisterAppearance {
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  opacity: number;
}

interface RegisterOption {
  value: string;
  label: string;
  analyzerName: string;
  analyzerId: string;
  address: number;
  dataType: string;
  bit?: number;
}

interface AddRegisterToWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newRegisterData: any) => void;
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

export const AddRegisterToWidgetModal: React.FC<AddRegisterToWidgetModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [allRegisters, setAllRegisters] = useState<RegisterOption[]>([]);
  const [selectedRegister, setSelectedRegister] = useState<RegisterOption | null>(null);
  const [valueSize, setValueSize] = useState({ width: 70, height: 40 });
  const [isLoading, setIsLoading] = useState(false);
  
  // Appearance settings
  const [fontFamily, setFontFamily] = useState<string>('Arial, sans-serif');
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [opacity, setOpacity] = useState<number>(100);

  useEffect(() => {
    if (isOpen) {
      const fetchRegisters = async () => {
        setIsLoading(true);
        try {
          const response = await fetch("/api/registers/list");
          if (!response.ok) throw new Error("Failed to fetch registers");
          const data = await response.json();
          const options = data.map((reg: any) => ({
            value: reg.id,
            label: `${reg.label} (${reg.analyzerName} - ${reg.address})`,
            analyzerName: reg.analyzerName,
            analyzerId: reg.analyzerId,
            address: reg.address,
            dataType: reg.dataType,
            bit: reg.bit,
          }));
          setAllRegisters(options);
        } catch (error) {
          console.error(error);
          showToast("Error fetching registers.", "error");
        } finally {
          setIsLoading(false);
        }
      };
      fetchRegisters();
    } else {
      setSelectedRegister(null);
      setValueSize({ width: 70, height: 40 });
      // Reset appearance settings
      setFontFamily('Arial, sans-serif');
      setTextColor('#ffffff');
      setBackgroundColor('#000000');
      setOpacity(100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!selectedRegister) {
      showToast("Please select a register.", "error");
      return;
    }
    
    // Add appearance settings to the register data
    const appearance: RegisterAppearance = {
      fontFamily,
      textColor,
      backgroundColor,
      opacity
    };
    
    const newRegisterData = {
        id: selectedRegister.value,
        label: selectedRegister.label.split('(')[0].trim(),
        analyzerName: selectedRegister.analyzerName,
        analyzerId: selectedRegister.analyzerId,
        address: selectedRegister.address,
        dataType: selectedRegister.dataType,
        bit: selectedRegister.bit,
        valueSize,
        appearance,
    };

    onConfirm(newRegisterData);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-lg">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">Add Register to Widget</h3>
        
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium">Register</Label>
            <Select
              options={allRegisters}
              isLoading={isLoading}
              value={selectedRegister}
              onChange={(option) => setSelectedRegister(option as RegisterOption)}
              className="mt-1 text-black"
              classNamePrefix="select"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Value Width</Label>
              <Input type="number" value={valueSize.width} onChange={(e) => setValueSize(s => ({...s, width: Number(e.target.value)}))} className="mt-1" />
            </div>
             <div>
              <Label className="text-sm">Value Height</Label>
              <Input type="number" value={valueSize.height} onChange={(e) => setValueSize(s => ({...s, height: Number(e.target.value)}))} className="mt-1" />
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

        <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Add Register</Button>
        </div>
      </div>
    </Modal>
  );
};