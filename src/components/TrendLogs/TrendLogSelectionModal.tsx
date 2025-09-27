"use client";

import { Modal } from "@/components/ui/modal";
import { Heading3, SmallText } from "@/components/ui/typography";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button/CustomButton";
import { Building, ChartLine, DoorOpen, Layers, Save } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { showToast } from "@/components/ui/alert";
import { TrendLogType } from "@/app/(project)/trend-log/page";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";

interface TrendLogSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  trendLogs: TrendLogType[];
  groupedTrendLogs: Record<string, TrendLogType[]>;
  selectedLogs: TrendLogType[];
  onSave: (selectedLogs: string[], configName: string) => Promise<void>;
  isLoading: boolean;
}

export default function TrendLogSelectionModal({
  isOpen,
  onClose,
  trendLogs,
  groupedTrendLogs,
  selectedLogs,
  onSave,
  isLoading
}: TrendLogSelectionModalProps) {
  const [localSelectedLogs, setLocalSelectedLogs] = useState<string[]>([]);
  const [configName, setConfigName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Initialize with current selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelectedLogs(selectedLogs.map(log => log._id));
    }
  }, [isOpen, selectedLogs]);

  const toggleLogSelection = (logId: string) => {
    setLocalSelectedLogs(prev => 
      prev.includes(logId) 
        ? prev.filter(id => id !== logId)
        : [...prev, logId]
    );
  };

  const isLogSelected = (logId: string) => {
    return localSelectedLogs.includes(logId);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(localSelectedLogs, configName || "Default Config");
      onClose();
    } catch (error) {
      console.error("Error saving configuration:", error);
      showToast("Failed to save configuration", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAll = (analyzerId: string) => {
    const analyzerLogs = groupedTrendLogs[analyzerId] || [];
    const analyzerLogIds = analyzerLogs.map(log => log._id);
    
    // Check if all logs from this analyzer are already selected
    const allSelected = analyzerLogIds.every(id => localSelectedLogs.includes(id));
    
    if (allSelected) {
      // If all are selected, deselect them
      setLocalSelectedLogs(prev => prev.filter(id => !analyzerLogIds.includes(id)));
    } else {
      // Otherwise, select all logs from this analyzer
      const newSelection = [...localSelectedLogs];
      analyzerLogIds.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
        }
      });
      setLocalSelectedLogs(newSelection);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-5xl max-h-[90vh]" showCloseButton={false}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <Heading3>Select Trend Logs</Heading3>
          <div className="flex space-x-2 items-center">
            <Label htmlFor="config-name" className="whitespace-nowrap">Configuration Name:</Label>
            <div className="flex-1 min-w-[200px]">
              <InputField
                id="config-name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="My Configuration"
              />
            </div>
          </div>
        </div>

        <div className="mb-4 text-sm text-gray-600">
          Selected: <span className="font-semibold">{localSelectedLogs.length}</span> of {trendLogs.length} logs
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 200px)" }}>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner variant="bars" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.keys(groupedTrendLogs).length === 0 ? (
                <div className="col-span-full text-center py-8">
                  <SmallText className="text-gray-500 dark:text-gray-400">No Trend Logs found</SmallText>
                </div>
              ) : (
                Object.entries(groupedTrendLogs).map(([analyzerId, logs]) => (
                  <div key={analyzerId} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="font-medium text-gray-800 dark:text-gray-200">
                        {logs[0].analyzer.name} (Slave: {logs[0].analyzer.slaveId})
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSelectAll(analyzerId)}
                        className="text-xs"
                      >
                        {logs.every(log => isLogSelected(log._id)) ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {logs.map((log) => (
                        <div 
                          key={log._id}
                          onClick={() => toggleLogSelection(log._id)}
                          className={`p-2 border rounded-md cursor-pointer transition-colors ${
                            isLogSelected(log._id) 
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600' 
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:hover:border-blue-800'
                          }`}
                        >
                          <div className="flex items-center">
                            <input 
                              type="checkbox"
                              checked={isLogSelected(log._id)}
                              onChange={() => {}} // Handled by div click
                              className="mr-2 h-4 w-4 text-blue-600"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{log.register.label}</div>
                              <div className="text-xs text-gray-500">
                                Address: {log.register.address} | {log.period}
                              </div>
                            </div>
                            <div className="ml-2">
                              <ChartLine 
                                size={16} 
                                className={isLogSelected(log._id) ? "text-blue-600" : "text-gray-400"}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={onClose} variant="secondary" className="mr-2">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="primary"
            disabled={localSelectedLogs.length === 0 || isSaving}
            leftIcon={<Save size={16} />}
          >
            {isSaving ? "Saving..." : `Save Selection (${localSelectedLogs.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}