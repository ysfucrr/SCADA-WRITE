/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronDown } from "lucide-react";
import { useState, useRef } from "react";

interface TrendLogTreeDropdownProps {
    kwhCounters: any[];
    index: number;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
}

export const TrendLogTreeDropdown: React.FC<TrendLogTreeDropdownProps> = ({ kwhCounters, value, onChange, disabled }) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [selectedTrendLog, setSelectedTrendLog] = useState<any>(value);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [trendLogQueryString, setTrendLogQueryString] = useState("");
    const getSelectedItemView = () => {
        console.log("selectedTrendLog", selectedTrendLog)
        return (
            selectedTrendLog && selectedTrendLog.register ?
                <div
                    className="p-2 cursor-pointer grid grid-cols-[1fr_3fr] text-xs space-y-2 w-full"
                    onClick={() => !disabled && handleItemClick(selectedTrendLog)}
                >

                    <div className="font-bold"> Label </div>
                    <div className="font-normal">{selectedTrendLog.register.data.label}</div>
                    <div className="font-bold"> Unit </div>
                    <div className="font-normal">{selectedTrendLog.unit}</div>
                    <div className="font-bold"> Analyzer </div>
                    <div className="font-normal">{selectedTrendLog.analyzer.name} (Slave: {selectedTrendLog.analyzer.slaveId})</div>
                    <div className="font-bold"> Address </div>
                    <div className="font-normal">{selectedTrendLog.register.data.address}</div>

                    {/* 
                    <div className="font-bold"> Unit </div>
                    <div className="font-normal">{selectedTrendLog.unit}</div>
                    <div className="font-bold"> Analyzer </div>
                    <div className="font-normal">{selectedTrendLog.analyzer.name}</div>
                    <div className="font-bold"> Register </div>
                    <div className="font-normal">{selectedTrendLog.register.data.label} ({selectedTrendLog.register.data.address})</div> */}
                </div>
                : "Select Register"
        )
    };
    const renderTrendLog = (trendLog: any, index: number) => {
        return (
            <div
                key={index}
                className="p-2 cursor-pointer grid grid-cols-[1fr_3fr] text-xs space-y-2"
                onClick={() => !disabled && handleItemClick(trendLog)}
            >

                <div className="font-bold"> Label </div>
                <div className="font-normal">{trendLog.register.data.label}</div>
                <div className="font-bold"> Unit </div>
                <div className="font-normal">{trendLog.unit}</div>
                <div className="font-bold"> Analyzer </div>
                <div className="font-normal">{trendLog.analyzer.name} (Slave: {trendLog.analyzer.slaveId})</div>
                <div className="font-bold"> Address </div>
                <div className="font-normal">{trendLog.register.data.address}</div>

            </div>
        )
    };
    const handleItemClick = (item: any) => {
        setSelectedTrendLog(item);
        onChange(item);
        setIsDropdownOpen(false);
    };
    return (
        <div className="relative w-full">
            <div
                className={`flex items-center justify-between p-2 border rounded-md ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                onClick={() => !disabled && setIsDropdownOpen(!isDropdownOpen)}
            >
                <span className="text-sm text-gray-600 dark:text-gray-400 w-full">{getSelectedItemView()}</span>
                <ChevronDown size={16} />
            </div>

            {isDropdownOpen && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto"
                >
                    {/* <div
                        className="p-2 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleRegisterItemClick('')}
                    >
                        Select Register
                    </div> */}
                     <input
                            type="text"
                            placeholder="Search registers by label"
                            className="p-2 border-b w-full"
                            value={trendLogQueryString}
                            onChange={(e) => {setTrendLogQueryString(e.target.value)}}
                        />
                    <div className="border-t">
                        {kwhCounters.filter(kwhCounter => trendLogQueryString == "" || kwhCounter.register.data.label.toLowerCase().includes(trendLogQueryString.toLowerCase())).map((kwhCounter: any, index: number) => renderTrendLog(kwhCounter, index))}
                    </div>
                </div>
            )}
        </div>
    );
};