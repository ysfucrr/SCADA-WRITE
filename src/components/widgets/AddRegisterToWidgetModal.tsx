"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Select from "react-select";
import { showToast } from "../ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export const AddRegisterToWidgetModal: React.FC<AddRegisterToWidgetModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [allRegisters, setAllRegisters] = useState<RegisterOption[]>([]);
  const [selectedRegister, setSelectedRegister] = useState<RegisterOption | null>(null);
  const [valueSize, setValueSize] = useState({ width: 120, height: 80 });
  const [isLoading, setIsLoading] = useState(false);

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
      setValueSize({ width: 120, height: 80 });
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!selectedRegister) {
      showToast("Please select a register.", "error");
      return;
    }
    
    const newRegisterData = {
        id: selectedRegister.value,
        label: selectedRegister.label.split('(')[0].trim(),
        analyzerName: selectedRegister.analyzerName,
        analyzerId: selectedRegister.analyzerId,
        address: selectedRegister.address,
        dataType: selectedRegister.dataType,
        bit: selectedRegister.bit,
        valueSize,
    };

    onConfirm(newRegisterData);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-lg">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">Add Register to Widget</h3>
        
        <div className="space-y-4">
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
        </div>

        <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Add Register</Button>
        </div>
      </div>
    </Modal>
  );
};