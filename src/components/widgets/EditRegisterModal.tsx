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
    analyzerId?: string;
    address?: number;
    dataType?: string;
    bit?: number;
    valueSize?: { width: number, height: number };
    labelSize?: { width: number, height: number };
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

  useEffect(() => {
    if (register && isOpen) {
      setRegisterLabel(register.label || "");
      setValueSize(register.valueSize || { width: 120, height: 80 });
    }
  }, [register, isOpen]);

  const handleConfirm = () => {
    if (!register) return;
    
    // Güncellenmiş register verisini hazırla
    const updatedRegister = {
      ...register,
      label: registerLabel,
      valueSize: valueSize
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
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400">Analyzer ID</Label>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{register.analyzerId}</p>
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
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};