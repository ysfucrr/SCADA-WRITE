"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { showToast } from "../ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Slider from "@/components/ui/slider";
import { Typography } from '@/components/ui/typography';
import Select from "@/components/form/Select";

interface AddReadyMadeWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (widgetData: ReadyMadeWidgetData) => void;
}

interface ReadyMadeWidgetData {
  title: string;
  type: 'chart';
  size: { width: number; height: number };
  appearance: WidgetAppearance;
  trendLogId?: string;
  chartConfig?: any;  // Kaldırmak için işaretliyoruz ama bunu tutuyoruz çünkü belki başka bir bileşen referans ediyor
}

interface WidgetAppearance {
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  opacity: number;
}

interface TrendLog {
  _id: string;
  registerId: string;
  analyzerId: string;
  address: number;
  dataType: string;
  isKWHCounter: boolean;
  period: string;
  interval?: number;
  analyzerName?: string;
  slaveId?: number;
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

const widgetTypes = [
  { value: 'chart', label: 'Chart' }
];


export const AddReadyMadeWidgetModal: React.FC<AddReadyMadeWidgetModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetType, setWidgetType] = useState<'chart'>('chart');
  const [widgetSize, setWidgetSize] = useState({ width: 600, height: 400 });
  const [selectedTrendLog, setSelectedTrendLog] = useState<string>("");
  const [trendLogs, setTrendLogs] = useState<TrendLog[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Appearance settings
  const [fontFamily, setFontFamily] = useState<string>('Arial, sans-serif');
  const [textColor, setTextColor] = useState<string>('#000000');
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  const [opacity, setOpacity] = useState<number>(100);

  // Fetch KWH Counter trend logs
  useEffect(() => {
    if (isOpen) {
      fetchKWHTrendLogs();
    }
  }, [isOpen]);

  const fetchKWHTrendLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/trend-logs?isKWHCounter=true');
      if (response.ok) {
        const data = await response.json();
        setTrendLogs(data);
      } else {
        showToast("Failed to fetch trend logs", "error");
      }
    } catch (error) {
      console.error("Error fetching trend logs:", error);
      showToast("Error fetching trend logs", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setWidgetTitle("");
      setWidgetType('chart');
      setWidgetSize({ width: 600, height: 400 });
      setSelectedTrendLog("");
      setFontFamily('Arial, sans-serif');
      setTextColor('#000000');
      setBackgroundColor('#ffffff');
      setOpacity(100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!widgetTitle) {
      showToast("Please enter a widget name.", "error");
      return;
    }

    if (widgetType === 'chart' && !selectedTrendLog) {
      showToast("Please select a trend log.", "error");
      return;
    }
    
    const appearance: WidgetAppearance = {
      fontFamily,
      textColor,
      backgroundColor,
      opacity
    };

    const widgetData: ReadyMadeWidgetData = {
      title: widgetTitle,
      type: widgetType,
      size: widgetSize,
      appearance,
      trendLogId: selectedTrendLog,
      chartConfig: {} // Boş bir chartConfig objesi ekleyerek geriye dönük uyumluluk sağlıyoruz
    };
    
    onConfirm(widgetData);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={true} className="sm:max-w-2xl">
      <div className="p-8">
        <h3 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Add Ready-Made Widget</h3>
        
        <div className="space-y-6">
          {/* Widget Type Selection */}
          <div>
            <Label htmlFor="widgetType" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Type</Label>
            <Select
              defaultValue={widgetType}
              onChange={(value) => setWidgetType(value as 'chart')}
              options={widgetTypes}
              className="mt-1"
            />
          </div>

          {/* Widget Name */}
          <div>
            <Label htmlFor="widgetName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Name</Label>
            <Input
              id="widgetName"
              type="text"
              value={widgetTitle}
              onChange={(e) => setWidgetTitle(e.target.value)}
              placeholder="e.g., Energy Consumption Chart"
              className="mt-1"
            />
          </div>

          {/* Trend Log Selection (for Chart type) */}
          {widgetType === 'chart' && (
            <>
              <div>
                <Label htmlFor="trendLog" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select KWH Counter Log
                </Label>
                {loading ? (
                  <div className="mt-1 p-2 text-gray-500">Loading trend logs...</div>
                ) : (
                  <select
                    id="trendLog"
                    value={selectedTrendLog}
                    onChange={(e) => setSelectedTrendLog(e.target.value)}
                    className="mt-1 text-black dark:text-white flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select a trend log</option>
                    {trendLogs.map((log) => {
                      // Format a user-friendly display name
                      let displayName = 'Unknown Analyzer';
                      
                      if (log.analyzerName) {
                        displayName = log.analyzerName;
                      }
                      
                      return (
                        <option key={log._id} value={log._id}>
                          {displayName}
                          {log.slaveId ? ` (Slave: ${log.slaveId})` : ''}
                          {'\n'}Interval: {log.interval || 1} minute, Address: {log.address}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            </>
          )}

          {/* Size Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="widgetWidth" className="text-sm font-medium text-gray-700 dark:text-gray-300">Widget Width (px)</Label>
              <Input
                id="widgetWidth"
                type="number"
                value={widgetSize.width}
                onChange={(e) => {
                  const newWidth = Number(e.target.value);
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
                value={widgetSize.height}
                onChange={(e) => {
                  const newHeight = Number(e.target.value);
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
                  className="text-black dark:text-white flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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