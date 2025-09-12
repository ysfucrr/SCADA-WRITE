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
  labelWidth?: number;
  labelHeight?: number;
  valueWidth?: number;
  valueHeight?: number;
}

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (widgetTitle: string, selectedRegisters: SelectedRegister[], widgetSize: { width: number, height: number }) => void;
  widgetToEdit?: any;
}

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ isOpen, onClose, onConfirm, widgetToEdit }) => {
  const [allRegisters, setAllRegisters] = useState<RegisterOption[]>([]);
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetSize, setWidgetSize] = useState({ width: 600, height: 400 });
  const [selectedRows, setSelectedRows] = useState<SelectedRegister[]>([
    {
      id: `row-${Date.now()}`,
      customLabel: "",
      labelWidth: 80,
      labelHeight: 28,
      valueWidth: 120,
      valueHeight: 80,
    },
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
        setWidgetSize({ width: 600, height: 400 });
        setSelectedRows([{
          id: `row-${Date.now()}`,
          customLabel: "",
          labelWidth: 80,
          labelHeight: 28,
          valueWidth: 120,
          valueHeight: 80,
        }]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (widgetToEdit && isOpen) {
      setWidgetTitle(widgetToEdit.title);
      if(widgetToEdit.size) {
        setWidgetSize(widgetToEdit.size);
      }
      // Widget verilerinde undefined değer olmadığından emin olalım
      setSelectedRows(widgetToEdit.registers.map((r: any) => {
        const correspondingRegister = allRegisters.find(reg => reg.value === r.id);
        
        // Varsayılan boyutları kullan ya da geçerli bir sayısal değer olduğundan emin ol
        const labelWidth = r.labelSize && typeof r.labelSize.width === 'number' ? r.labelSize.width : 80;
        const labelHeight = r.labelSize && typeof r.labelSize.height === 'number' ? r.labelSize.height : 28;
        const valueWidth = r.valueSize && typeof r.valueSize.width === 'number' ? r.valueSize.width : 120;
        const valueHeight = r.valueSize && typeof r.valueSize.height === 'number' ? r.valueSize.height : 80;
        
        return {
          id: `row-${Math.random()}`,
          selectedRegister: {
            value: r.id,
            label: correspondingRegister ? correspondingRegister.label : r.label,
            analyzerId: r.analyzerId,
            analyzerName: correspondingRegister ? correspondingRegister.analyzerName : 'Unknown',
            address: r.address,
            dataType: r.dataType,
            bit: r.bit,
          },
          customLabel: r.label || '',
          labelWidth: labelWidth,
          labelHeight: labelHeight,
          valueWidth: valueWidth,
          valueHeight: valueHeight,
        };
      }));
    }
  }, [widgetToEdit, isOpen, allRegisters]);

  const handleAddRegisterRow = () => {
    setSelectedRows([...selectedRows, {
      id: `row-${Date.now()}`,
      customLabel: "",
      labelWidth: 80,
      labelHeight: 28,
      valueWidth: 120,
      valueHeight: 80,
    }]);
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

  const handleSizeChange = (rowId: string, field: 'labelWidth' | 'labelHeight' | 'valueWidth' | 'valueHeight', value: string) => {
    // Boş değer kontrolü - boş değerleri varsayılan değerlere çevir
    let numericValue: number;
    
    if (value === '') {
      // Varsayılan değerler
      switch(field) {
        case 'labelWidth':
          numericValue = 80;
          break;
        case 'labelHeight':
          numericValue = 28;
          break;
        case 'valueWidth':
          numericValue = 120;
          break;
        case 'valueHeight':
          numericValue = 80;
          break;
        default:
          numericValue = 0;
      }
    } else {
      numericValue = Number(value);
    }
    
    // Negatif değerlere izin verme
    if (numericValue <= 0) {
      return;
    }
    
    setSelectedRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId ? { ...row, [field]: numericValue } : row
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
    
    // Boyut değerlerinin sayısal olduğundan emin olalım
    const processedRegisters = validRegisters.map(register => ({
      ...register,
      labelWidth: Number(register.labelWidth) || 80,
      labelHeight: Number(register.labelHeight) || 28,
      valueWidth: Number(register.valueWidth) || 120,
      valueHeight: Number(register.valueHeight) || 80
    }));
    
    onConfirm(widgetTitle, processedRegisters, widgetSize);
    onClose();
  };

  const isEditMode = !!widgetToEdit;

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-2xl">
      <div className="p-8">
        <h3 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{isEditMode ? "Edit Widget" : "Add New Widget"}</h3>
        
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
                         value={widgetSize.width || 600}
                         onChange={(e) => {
                           const newWidth = e.target.value === '' ? 600 : Number(e.target.value);
                           if (newWidth > 0) {
                             setWidgetSize(s => ({...s, width: newWidth}));
                           }
                         }}
                         placeholder="e.g., 600"
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
            
            <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Registers</Label>
                <div className="mt-2 space-y-4">
                    {selectedRows.map((row) => (
                         <div key={row.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <Label className="text-xs text-gray-500">Label Width</Label>
                                    <Input
                                        type="number"
                                        value={row.labelWidth || 80}
                                        onChange={(e) => handleSizeChange(row.id, 'labelWidth', e.target.value)}
                                        className="mt-1"
                                        placeholder="80"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Label Height</Label>
                                    <Input
                                        type="number"
                                        value={row.labelHeight || 28}
                                        onChange={(e) => handleSizeChange(row.id, 'labelHeight', e.target.value)}
                                        className="mt-1"
                                        placeholder="28"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Value Width</Label>
                                    <Input
                                        type="number"
                                        value={row.valueWidth || 120}
                                        onChange={(e) => handleSizeChange(row.id, 'valueWidth', e.target.value)}
                                        className="mt-1"
                                        placeholder="120"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Value Height</Label>
                                    <Input
                                        type="number"
                                        value={row.valueHeight || 80}
                                        onChange={(e) => handleSizeChange(row.id, 'valueHeight', e.target.value)}
                                        className="mt-1"
                                        placeholder="80"
                                    />
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