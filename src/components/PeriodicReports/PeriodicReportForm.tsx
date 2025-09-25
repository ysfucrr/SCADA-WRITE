import React, { useState, useEffect, useRef } from "react";
import { SmallText } from "@/components/ui/typography";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "../ui/spinner";
import { ChevronDown, Clock, X } from "lucide-react";
import { showToast } from "../ui/alert";
import DatePicker from "../form/date-picker";
import Checkbox from "../form/input/Checkbox";

interface PeriodicReportFormProps {
    report?: any;
    onSubmit: (reportData: {
        description: string;
        frequency: string;
        schedule: {
            dayOfWeek?: number;
            dayOfMonth?: number;
            hour: number;
            minute: number;
        };
        format: 'html' | 'pdf';
        last24HoursOnly?: boolean;
        trendLogs: { id: string; label: string }[];
        // Recipients now managed through centralized mail settings
    }) => void;
    onCancel: () => void;
    trendLogs: any[];
}

const PeriodicReportForm: React.FC<PeriodicReportFormProps> = ({ report, onSubmit, onCancel, trendLogs }) => {
    // Form state
    const [description, setDescription] = useState(report?.description || "");
    const [frequency, setFrequency] = useState(report?.frequency || "daily");
    const [dayOfWeek, setDayOfWeek] = useState(report?.schedule?.dayOfWeek || 1); // Monday default
    const [dayOfMonth, setDayOfMonth] = useState(report?.schedule?.dayOfMonth || 1);
    const [hour, setHour] = useState(report?.schedule?.hour || 8); // 8 AM default
    const [minute, setMinute] = useState(report?.schedule?.minute || 0);
    const [format, setFormat] = useState<'pdf'>('pdf');
    const [last24HoursOnly, setLast24HoursOnly] = useState<boolean>(report?.last24HoursOnly || false);
    const [selectedTrendLogs, setSelectedTrendLogs] = useState<{id: string, label: string}[]>(report?.trendLogs || []);
    
    const [isTrendLogDropdownOpen, setIsTrendLogDropdownOpen] = useState(false);
    const [trendLogSearchQuery, setTrendLogSearchQuery] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const { isLoading: isAuthLoading } = useAuth();
    const [saving, setSaving] = useState(false);

    // Handle outside click for dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsTrendLogDropdownOpen(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Toggle trend log selection
    const handleToggleTrendLog = (id: string) => {
        if (selectedTrendLogs.some(item => item.id === id)) {
            setSelectedTrendLogs(selectedTrendLogs.filter(item => item.id !== id));
        } else {
            // Default label olarak trend log'un adını kullan
            const trendLog = trendLogs.find(log => log._id === id);
            const defaultLabel = trendLog?.displayName || trendLog?.analyzerName || 'Trend Log';
            setSelectedTrendLogs([...selectedTrendLogs, { id, label: defaultLabel }]);
        }
    };

    // Form submission
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        // Validation
        if (selectedTrendLogs.length === 0) {
            showToast("Please select at least one trend log", "error");
            setSaving(false);
            return;
        }

        // Prepare schedule based on frequency
        const schedule: any = { hour, minute };
        if (frequency === 'weekly') {
            schedule.dayOfWeek = dayOfWeek;
        } else if (frequency === 'monthly') {
            schedule.dayOfMonth = dayOfMonth;
        }

        onSubmit({
            description,
            frequency,
            schedule,
            format,
            last24HoursOnly,
            trendLogs: selectedTrendLogs,
        });

        setSaving(false);
    };

    // Get display names of days
    const getDayName = (dayIndex: number) => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayIndex];
    };

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-6 text-blue-600 dark:text-blue-400">
                {report ? "Edit Periodic Report" : "Add New Periodic Report"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Report Description */}
                <div className="space-y-2">
                    <Label htmlFor="report-description">Description (Optional)</Label>
                    <textarea
                        id="report-description"
                        placeholder="Brief description of this report"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-gray-900 dark:text-gray-100 bg-transparent dark:border-gray-700 resize-none h-24"
                    />
                </div>

                {/* Frequency and Schedule */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="frequency">Report Frequency</Label>
                        <Select
                            options={[
                                { value: "daily", label: "Daily" },
                                { value: "weekly", label: "Weekly" },
                                { value: "monthly", label: "Monthly" }
                            ]}
                            onChange={(value) => setFrequency(value)}
                            defaultValue={frequency}
                        />
                    </div>
                    
                    {frequency === 'weekly' && (
                        <div className="space-y-2">
                            <Label htmlFor="day-of-week">Day of Week</Label>
                            <Select
                                options={[
                                    { value: "0", label: "Sunday" },
                                    { value: "1", label: "Monday" },
                                    { value: "2", label: "Tuesday" },
                                    { value: "3", label: "Wednesday" },
                                    { value: "4", label: "Thursday" },
                                    { value: "5", label: "Friday" },
                                    { value: "6", label: "Saturday" }
                                ]}
                                onChange={(value) => setDayOfWeek(parseInt(value))}
                                defaultValue={dayOfWeek.toString()}
                            />
                        </div>
                    )}
                    
                    {frequency === 'monthly' && (
                        <div className="space-y-2">
                            <Label htmlFor="day-of-month">Day of Month</Label>
                            <Select
                                options={Array.from({ length: 31 }, (_, i) => ({
                                    value: (i + 1).toString(),
                                    label: (i + 1).toString()
                                }))}
                                onChange={(value) => setDayOfMonth(parseInt(value))}
                                defaultValue={dayOfMonth.toString()}
                            />
                        </div>
                    )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="time-hour">Time (24-hour format)</Label>
                        <div className="flex items-center space-x-2">
                            <div className="flex-1">
                                <Select
                                    options={Array.from({ length: 24 }, (_, i) => ({
                                        value: i.toString(),
                                        label: i.toString().padStart(2, '0')
                                    }))}
                                    onChange={(value) => setHour(parseInt(value))}
                                    defaultValue={hour.toString()}
                                />
                            </div>
                            <span className="text-gray-500">:</span>
                            <div className="flex-1">
                                <Select
                                    options={[
                                        { value: "0", label: "00" },
                                        { value: "15", label: "15" },
                                        { value: "30", label: "30" },
                                        { value: "45", label: "45" }
                                    ]}
                                    onChange={(value) => setMinute(parseInt(value))}
                                    defaultValue={minute.toString()}
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Report Format</Label>
                        <div className="px-3 py-2 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            PDF Attachment
                        </div>
                    </div>
                </div>

                {/* Data Range Option */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="last24HoursOnly"
                            checked={last24HoursOnly}
                            onChange={setLast24HoursOnly}
                        />
                        <Label htmlFor="last24HoursOnly" className="text-sm">
                            Include only last 24 hours data
                        </Label>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                        If unchecked, all historical trend log data will be included in the report.
                    </p>
                </div>

                {/* Trend Log Selection */}
                <div className="space-y-2">
                    <Label>Select Trend Logs to Include</Label>
                    <div className="relative w-full">
                        <div
                            className="flex items-center justify-between p-2 border rounded-md cursor-pointer"
                            onClick={() => setIsTrendLogDropdownOpen(!isTrendLogDropdownOpen)}
                        >
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                {selectedTrendLogs.length === 0
                                    ? "Select trend logs to include in report"
                                    : selectedTrendLogs.length === 1
                                        ? trendLogs.find(log => log._id === selectedTrendLogs[0].id)?.displayName || `${selectedTrendLogs.length} trend log selected`
                                        : `${selectedTrendLogs.length} trend logs selected`}
                            </span>
                            <ChevronDown size={16} />
                        </div>
                        
                        {isTrendLogDropdownOpen && (
                            <div
                                ref={dropdownRef}
                                className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto"
                            >
                                <input
                                    type="text"
                                    placeholder="Search by analyzer name or register name"
                                    className="p-2 border-b dark:border-gray-700 w-full dark:bg-gray-800 dark:text-gray-300"
                                    value={trendLogSearchQuery}
                                    onChange={(e) => setTrendLogSearchQuery(e.target.value)}
                                />
                                
                                <div className="divide-y dark:divide-gray-700">
                                    {trendLogs.length === 0 ? (
                                        <div className="p-2 text-gray-500 dark:text-gray-400">
                                            No trend logs available
                                        </div>
                                    ) : (
                                        trendLogs
                                            .filter(log =>
                                                trendLogSearchQuery === "" ||
                                                (log.analyzerName?.toLowerCase() || "").includes(trendLogSearchQuery.toLowerCase()) ||
                                                (log.registerName?.toLowerCase() || "").includes(trendLogSearchQuery.toLowerCase()) ||
                                                (log.displayName?.toLowerCase() || "").includes(trendLogSearchQuery.toLowerCase()) ||
                                                (log.address?.toString()?.toLowerCase() || "").includes(trendLogSearchQuery.toLowerCase())
                                            )
                                            .map(log => (
                                                <div
                                                    key={log._id}
                                                    className="p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    onClick={() => handleToggleTrendLog(log._id)}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <Checkbox
                                                            id={`trend-log-${log._id}`}
                                                            checked={selectedTrendLogs.some(item => item.id === log._id)}
                                                            onChange={() => {}}
                                                        />
                                                        <div>
                                                            <div className="font-medium">
                                                                {log.analyzerName || "Analyzer"} (Slave: {log.analyzerSlaveId || "N/A"})
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                Interval: {log.interval} minute, Address: {log.address || "N/A"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {selectedTrendLogs.length > 0 && (
                        <div className="mt-4 space-y-3">
                            <Label>Selected Trend Logs with Labels</Label>
                            <div className="max-h-64 overflow-y-auto space-y-3">
                            {selectedTrendLogs.map((item, index) => {
                                const trendLog = trendLogs.find(log => log._id === item.id);
                                return (
                                    <div key={item.id} className="flex items-center gap-3 p-2 border rounded-md dark:border-gray-700">
                                        <div className="flex-1">
                                            <SmallText className="text-gray-600 dark:text-gray-400">
                                                {trendLog?.displayName || trendLog?.analyzerName || 'Trend Log'}
                                                {trendLog?.address && ` (Address: ${trendLog.address})`}
                                            </SmallText>
                                        </div>
                                        <div className="flex-1">
                                            <InputField
                                                placeholder="Enter label for this trend log"
                                                value={item.label}
                                                onChange={(e) => {
                                                    const newSelected = [...selectedTrendLogs];
                                                    newSelected[index].label = e.target.value;
                                                    setSelectedTrendLogs(newSelected);
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTrendLogs(selectedTrendLogs.filter((_, i) => i !== index))}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-end space-x-3 mt-8">
                    <button
                        disabled={saving}
                        type="button"
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={saving}
                        type="submit"
                        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                        {report 
                            ? (saving ? "Saving..." : "Save Changes") 
                            : (saving ? "Adding..." : "Add Periodic Report")}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PeriodicReportForm;