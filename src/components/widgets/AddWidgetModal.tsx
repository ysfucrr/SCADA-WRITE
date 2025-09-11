"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Select from "react-select";
import { showToast } from "../ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrashIcon } from "@heroicons/react/24/outline";

interface RegisterOption {
  value: string;
  label: string;
  analyzerId: string;
  analyzerName: string;
  address: number;
  dataType: string;
  bit?: number;
}

interface SelectedRegister {
  id: string; // Unique ID for the row
  selectedRegister?: RegisterOption;
  customLabel: string;
}

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (widgetTitle: string, selectedRegisters: SelectedRegister[]) => void;
}

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [allRegisters, setAllRegisters] = useState<RegisterOption[]>([]);
  const [widgetTitle, setWidgetTitle] = useState("");
  const [selectedRows, setSelectedRows] = useState<SelectedRegister[]>([
    { id: `row-${Date.now()}`, customLabel: "" },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchRegisters = async () => {
        setIsLoading(true);
        try {
          const response = await fetch("/api/registers/list");
          if (!response.ok) {
            throw new Error("Failed to fetch registers");
          }
          const data = await response.json();
          const options = data.map((reg: any) => ({
            value: reg.id,
            label: `${reg.label} (${reg.analyzerName} - ${reg.address})`,
            analyzerId: reg.analyzerId,
            analyzerName: reg.analyzerName,
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
        // Reset state on close
        setWidgetTitle("");
        setSelectedRows([{ id: `row-${Date.now()}`, customLabel: "" }]);
    }
  }, [isOpen]);

  const handleAddRegisterRow = () => {
    setSelectedRows([...selectedRows, { id: `row-${Date.now()}`, customLabel: "" }]);
  };

  const handleRemoveRegisterRow = (id: string) => {
    setSelectedRows(selectedRows.filter(row => row.id !== id));
  };
  
  const handleRegisterChange = (selectedOption: RegisterOption | null, rowId: string) => {
      setSelectedRows(prevRows => 
        prevRows.map(row => 
            row.id === rowId ? { ...row, selectedRegister: selectedOption || undefined, customLabel: selectedOption?.label.split('(')[0].trim() || "" } : row
        )
      );
  };

  const handleLabelChange = (newLabel: string, rowId: string) => {
      setSelectedRows(prevRows =>
        prevRows.map(row =>
            row.id === rowId ? { ...row, customLabel: newLabel } : row
        )
      );
  };

  const handleConfirm = () => {
    if (!widgetTitle) {
      showToast("Please enter a widget name.", "error");
      return;
    }
    const validRegisters = selectedRows.filter(row => row.selectedRegister);
    if (validRegisters.length === 0) {
        showToast("Please select at least one register.", "error");
        return;
    }
    onConfirm(widgetTitle, validRegisters);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-2xl">
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
            
            <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Registers</Label>
                <div className="mt-2 space-y-4">
                    {selectedRows.map((row) => (
                         <div key={row.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                <div>
                                    <Label className="text-xs text-gray-500">Register</Label>
                                     <Select
                                        options={allRegisters}
                                        isLoading={isLoading}
                                        value={row.selectedRegister}
                                        onChange={(option) => handleRegisterChange(option as RegisterOption, row.id)}
                                        className="mt-1 text-black"
                                        classNamePrefix="select"
                                    />
                                </div>
                                <div className="flex items-end gap-2">
                                   <div className="flex-grow">
                                        <Label className="text-xs text-gray-500">Label (Optional)</Label>
                                        <Input
                                            type="text"
                                            value={row.customLabel}
                                            onChange={(e) => handleLabelChange(e.target.value, row.id)}
                                            placeholder="Custom Label"
                                            className="mt-1"
                                        />
                                   </div>
                                    <Button variant="outline" size="sm" onClick={() => handleRemoveRegisterRow(row.id)} className="h-10 w-10 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                                        <TrashIcon className="h-5 w-5"/>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                     <button
                        type="button"
                        onClick={handleAddRegisterRow}
                        className="w-full flex justify-center items-center px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                        + Add Register
                    </button>
                </div>
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  );
};