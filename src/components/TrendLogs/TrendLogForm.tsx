import React, { useState, useEffect, useRef } from "react";
import { TrendLogType } from "@/app/(project)/trend-log/page";
import { SmallText } from "@/components/ui/typography";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { Node } from "reactflow";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "../ui/spinner";
import { Building, ChevronDown, DoorOpen, Layers } from "lucide-react";
import { showToast } from "../ui/alert";
import DatePicker from "../form/date-picker";
import Checkbox from "../form/input/Checkbox";
interface TrendLogFormProps {
    trendLog?: TrendLogType;
    onSubmit: (trendLogData: {
        period: string;
        interval: number;
        endDate: string;
        analyzerId: string;
        registerId: string;
        isKWHCounter: boolean;
        address: number;
        dataType: string;
        byteOrder: string;
        scale: number;
        cleanupPeriod?: number; // onChange için otomatik temizleme süresi
        percentageThreshold?: number; // onChange için yüzde eşiği
    }) => void;
    onCancel: () => void;
    analyzers: any[];
    usedRegisters: any[];
}

const TrendLogForm: React.FC<TrendLogFormProps> = ({ trendLog, onSubmit, onCancel, analyzers, usedRegisters }) => {
    const [, setBuildings] = useState<any[]>([]);
    const [, setAnalyzers] = useState<any[]>([]);
    const [endDate, setEndDate] = useState(trendLog?.endDate || "");
    const [period, setPeriod] = useState(trendLog?.period || "minute");
    const [isKWHCounter, setIsKWHCounter] = useState(trendLog?.isKWHCounter || false);
    const [interval, setInterval] = useState(trendLog?.interval || 1);
    const [cleanupPeriod, setCleanupPeriod] = useState<number>(trendLog?.cleanupPeriod || 1);
    const [percentageThreshold, setPercentageThreshold] = useState<number>(trendLog?.percentageThreshold || 0.5);
    const [registers, setRegisters] = useState<any[]>([]);
    const { isLoading: isAuthLoading, isAdmin, user } = useAuth();
    const [selectedRegister, setSelectedRegister] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [, setGateways] = useState<any[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [saving, setSaving] = useState(false);
    const [registerQueryString, setRegisterQueryString] = useState("");
    
    useEffect(() => {
        if (trendLog) {
            console.log("trend log in form: ", trendLog)
            setEndDate(trendLog.endDate);
            setPeriod(trendLog.period);
            setInterval(trendLog.interval);
            setIsKWHCounter(trendLog.isKWHCounter);
            setCleanupPeriod(trendLog.cleanupPeriod || 1);
            setPercentageThreshold(trendLog.percentageThreshold || 0.5);
        }
    }, [trendLog]);
    const fetchBuildings = async (gateways: any[]) => {
        if (!usedRegisters) return
        console.warn("fetch buildings")
        try {
            const response = await fetch('/api/units');
            const data = await response.json();
            const buildingsData = data.buildings;
            console.log("buildingsData", buildingsData);
            const allRegisters = [];
            for (const building of buildingsData) {
                const flowData = building.flowData;
                console.log("flowData", flowData);
                if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                    for (const node of flowData.nodes) {
                        if ((node as Node).type == "registerNode") {
                            console.log("node", node);
                            if (usedRegisters.find((register) => register == node.id)) continue;
                            const analyzer = analyzers.find((analyzer) => analyzer._id == node.data.analyzerId);
                            if (!analyzer) continue;
                            const gateway = gateways.find((gateway) => gateway._id == analyzer.gateway);
                            allRegisters.push({
                                registerInfo: { id: node.id, ...node.data },
                                analyzerInfo: analyzer,
                                gatewayInfo: gateway,
                                unit: <div className="flex items-center gap-1">
                                    {building.icon ? <div className="relative h-4 w-4">
                                        <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                    </div> : <Building className="h-4 w-4" />}
                                    <span>{building.name}</span>
                                </div>,
                            });
                        }
                    }
                }
                if (building.floors && building.floors.length > 0) {
                    for (const floor of building.floors) {
                        const flowData = floor.flowData;
                        if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                            for (const node of flowData.nodes) {
                                if ((node as Node).type == "registerNode") {
                                    if (usedRegisters.find((register) => register == node.id)) continue;
                                    const analyzer = analyzers.find((analyzer) => analyzer._id == node.data.analyzerId);
                                    const gateway = gateways.find((gateway) => gateway._id == analyzer.gateway);
                                    allRegisters.push({
                                        registerInfo: { id: node.id, ...node.data },
                                        analyzerInfo: analyzer,
                                        gatewayInfo: gateway,
                                        unit: <div className="flex items-center gap-1">
                                            {building.icon ? <div className="relative h-4 w-4">
                                                <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                            </div> : <Building className="h-4 w-4" />}
                                            <span>{building.name}</span>
                                            {floor.icon ? <div className="relative h-4 w-4">
                                                <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
                                            </div> : <Layers className="h-4 w-4" />}
                                            {` > `}<span>{floor.name}</span>
                                        </div>,
                                    });
                                }
                            }
                        }
                        if (floor.rooms && floor.rooms.length > 0) {
                            for (const room of floor.rooms) {
                                const flowData = room.flowData;
                                if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                                    for (const node of flowData.nodes) {
                                        if ((node as Node).type == "registerNode") {
                                            if (usedRegisters.find((register) => register == node.id)) continue;
                                            const analyzer = analyzers.find((analyzer) => analyzer._id == node.data.analyzerId);
                                            const gateway = gateways.find((gateway) => gateway._id == analyzer.gateway);
                                            allRegisters.push({
                                                registerInfo: { id: node.id, ...node.data },
                                                analyzerInfo: analyzer,
                                                gatewayInfo: gateway,
                                                unit: <div className="flex items-center gap-1">
                                                    {building.icon ? <div className="relative h-4 w-4">
                                                        <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                                    </div> : <Building className="h-4 w-4" />}
                                                    <span>{building.name}</span>
                                                    {floor.icon ? <div className="relative h-4 w-4">
                                                        <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
                                                    </div> : <Layers className="h-4 w-4" />}
                                                    {` > `}<span>{floor.name}</span>
                                                    {room.icon ? <div className="relative h-4 w-4">
                                                        <img src={room.icon} alt={room.name} className="h-full w-full object-contain" />
                                                    </div> : <DoorOpen className="h-4 w-4" />}
                                                    {` > `}<span>{room.name}</span>
                                                </div>,
                                            });
                                        }
                                    }
                                }
                            }
                        }

                    }
                }
            }
            //console.log("registerNodes", allRegisters);
            setRegisters(allRegisters);
            if (trendLog && trendLog.registerId) {
                setSelectedRegister(allRegisters.find((register) => register.registerInfo.id == trendLog.registerId));
            }
            setBuildings(data.buildings);

        } catch (error) {
            console.error('Error fetching buildings:', error);
        }
    };
    const fetchAnalyzers = async () => {
        try {
            const response = await fetch('/api/analyzers');
            const data = await response.json();
            console.log("data", data);
            setAnalyzers(data);
            return data
        } catch (error) {
            console.error('Error fetching analyzers:', error);
        }
    };

    const fetchGateways = async () => {
        try {
            const response = await fetch('/api/gateway');
            const data = await response.json();
            console.log("data", data);
            setGateways(data);
            return data
        } catch (error) {
            console.error('Error fetching gateway:', error);
        }
    };

    useEffect(() => {
        if (!analyzers) return
        console.warn("isAuthLoading", isAuthLoading);
        console.warn("isAdmin", isAdmin);
        if (!isAuthLoading && (isAdmin || user?.permissions?.trendLog)) {
            setIsLoading(true);
            fetchGateways().then((gateways) => {
                console.log("fetched gateways", gateways);
                fetchBuildings(gateways).then(() => {
                    setIsLoading(false);
                });
            });
            // fetchAnalyzers().then((analyzers) => {
            //     console.log("fetched analyzers", analyzers);
            // });
        }
    }, [isAuthLoading, isAdmin, analyzers, usedRegisters]);

    useEffect(() => {
        console.log("selected register: ", selectedRegister)
    }, [selectedRegister]);
    const handleSubmit = async (e: React.FormEvent) => {
        setSaving(true);
        e.preventDefault();
        if (!selectedRegister) {
            showToast("Please select a register", "error");
            return;
        }
        
        // onChange için cleanupPeriod'u kontrol et
        if (period === 'onChange' && !cleanupPeriod) {
            showToast("Auto Cleanup Period is required for onChange mode", "error");
            return;
        }
        
        console.log("end date", endDate)
        console.log("selected register on submit: ", selectedRegister)

        await onSubmit({
            period: period,
            interval: interval,
            endDate: endDate,
            isKWHCounter: isKWHCounter,
            analyzerId: selectedRegister.analyzerInfo._id,
            registerId: selectedRegister.registerInfo.id,
            address: selectedRegister.registerInfo.address,
            dataType: selectedRegister.registerInfo.dataType,
            byteOrder: selectedRegister.registerInfo.byteOrder,
            scale: selectedRegister.registerInfo.scale,
            cleanupPeriod: period === 'onChange' ? cleanupPeriod : undefined, // onChange ise temizleme süresi ekle
            percentageThreshold: period === 'onChange' && !isKWHCounter ? parseFloat(percentageThreshold as any) : undefined, // onChange ve KWH Counter değilse yüzde eşiği ekle
        });
        setSaving(false);
    };
    const getSelectedItemView = () => {
        return (
            selectedRegister ?
                <div
                    className={`p-2 grid grid-cols-[1fr_3fr] text-xs space-y-2 w-full ${trendLog ? "cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={() => handleRegisterItemClick(selectedRegister)}
                >

                    <div className="font-bold"> Label </div>
                    <div className="font-normal">{selectedRegister.registerInfo.label}</div>

                    <div className="font-bold"> Unit </div>
                    <div className="font-normal">{selectedRegister.unit}</div>
                    <div className="font-bold"> Analyzer </div>
                    <div className="font-normal">{selectedRegister.analyzerInfo.name} (Slave: {selectedRegister.analyzerInfo.slaveId})</div>
                    <div className="font-bold"> gateway </div>
                    <div className="font-normal">{selectedRegister.gatewayInfo.name} ({selectedRegister.gatewayInfo.connectionType === "tcp" ? selectedRegister.gatewayInfo.ipAddress + ":" + selectedRegister.gatewayInfo.port : selectedRegister.gatewayInfo.port})</div>
                    <div className="font-bold"> Address </div>
                    <div className="font-normal">{selectedRegister.registerInfo.address}</div>
                </div>
                : "Select Register"
        )
    };

    const renderRegister = (register: any) => {
        return (
            <div
                key={register.registerInfo.id}
                className={`p-2 grid grid-cols-[1fr_3fr] text-xs space-y-2 ${trendLog ? "cursor-not-allowed" : "cursor-pointer"}`}
                onClick={() => handleRegisterItemClick(register)}
            >

                <div className="font-bold"> Label </div>
                <div className="font-normal">{register.registerInfo.label}</div>
                <div className="font-bold"> Unit </div>
                <div className="font-normal">{register.unit}</div>
                <div className="font-bold"> Analyzer </div>
                <div className="font-normal">{register.analyzerInfo.name} (Slave: {register.analyzerInfo.slaveId})</div>
                <div className="font-bold"> gateway </div>
                <div className="font-normal">{register.gatewayInfo.name} ({register.gatewayInfo.connectionType === "tcp" ? register.gatewayInfo.ipAddress + ":" + register.gatewayInfo.port : register.gatewayInfo.port})</div>
                <div className="font-bold"> Address </div>
                <div className="font-normal">{register.registerInfo.address}</div>
            </div>
        )
    };
    const handleRegisterItemClick = (register: any) => {
        setSelectedRegister(register);
        setIsDropdownOpen(false);
    };
    const renderRegisterDropdown = () => {
        return (
            <div className="relative w-full">
                <div
                    className={`flex items-center justify-between p-2 border rounded-md  ${trendLog ? "cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={trendLog ? undefined : () => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-full">{getSelectedItemView()}</span>
                    <ChevronDown size={16} />
                </div>

                {isDropdownOpen && (
                    <div
                        ref={dropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto"
                    >
                        <input
                            type="text"
                            placeholder="Search registers by label"
                            className="p-2 border-b w-full"
                            value={registerQueryString}
                            onChange={(e) => {setRegisterQueryString(e.target.value)}}
                        />
                        {/* <div
                            className="p-2 cursor-pointer hover:bg-gray-100"
                            onClick={() => handleRegisterItemClick('')}
                        >
                            Select Register
                        </div> */}
                        {analyzers.length > 0 ? <div className="border-t">
                            {registers.filter(register => registerQueryString == "" || register.registerInfo.label.toLowerCase().includes(registerQueryString.toLowerCase())).map(register => renderRegister(register))}
                        </div> : <div className="border-t">
                            <div className={`p-2 hover:bg-gray-100 ${trendLog ? "cursor-not-allowed" : "cursor-pointer"}`}>
                                No available analyzer found
                            </div>
                        </div>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-6 text-blue-600 dark:text-blue-400">
                {trendLog ? "Edit Trend Log" : "Add New Trend Log"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Trend Log Name */}
                <div className="flex items-center gap-2 w-full">
                    {isLoading ? (
                        <div className="flex h-10 w-full items-center justify-center border border-input rounded-md bg-background">
                            <Spinner variant='bars' />
                        </div>
                    ) : (
                        renderRegisterDropdown()
                    )}
                </div>

                <div className="flex flex-row space-x-2">
                    <div className="space-y-2">
                        <Label htmlFor="period">Period</Label>
                        <Select
                            options={[
                                { value: "minute", label: "Minute" },
                                { value: "hour", label: "Hour" },
                                { value: "day", label: "Day" },
                                { value: "week", label: "Week" },
                                { value: "month", label: "Month" },
                                { value: "onChange", label: "On Change" },
                            ]}
                            onChange={(value) => setPeriod(value)}
                            defaultValue={period}
                        />
                    </div>
                    {period !== "onChange" && (
                        <div className="space-y-2">
                            <Label htmlFor="interval">Interval</Label>
                            <InputField
                                id="interval"
                                type="number"
                                placeholder="Interval"
                                value={interval}
                                onChange={(e) => setInterval(Number(e.target.value))}
                            />
                        </div>
                    )}
                </div>
                <div className="flex flex-row space-x-2 items-center">
                    <Checkbox
                        id="is-kwh-counter"
                        checked={isKWHCounter}
                        onChange={setIsKWHCounter}
                    />
                    <Label htmlFor="is-kwh-counter">Is KWH Counter</Label>
                </div>
                {/* onChange için cleanupPeriod seçimi */}
                {period === "onChange" && (
                    <div className="space-y-2">
                        <Label htmlFor="cleanupPeriod">Auto Cleanup Period</Label>
                        <Select

                            options={[
                                { value: "1", label: "1 Month" },
                                { value: "2", label: "2 Months" },
                                { value: "3", label: "3 Months" },
                                { value: "6", label: "6 Months" },
                                { value: "12", label: "12 Months (1 Year)" }
                            ]}
                            onChange={(value) => setCleanupPeriod(Number(value))}
                            defaultValue={cleanupPeriod ? cleanupPeriod.toString() : "1"}
                        />
                        <SmallText className="text-gray-500 dark:text-gray-400">
                            onChange log entries will be automatically deleted after this period.
                        </SmallText>
                    </div>
                )}
                {/* onChange için percentage threshold seçimi - KWH Counter değilse göster */}
                {period === "onChange" && !isKWHCounter && (
                    <div className="space-y-2">
                        <Label htmlFor="percentageThreshold">Percentage Threshold (%)</Label>
                        <InputField
                            id="percentageThreshold"
                            type="number"
                            placeholder="0.5"
                            value={percentageThreshold}
                            onChange={(e) => setPercentageThreshold(parseFloat(e.target.value))}
                            min="0.5"
                            max="100"
                            step={0.5}
                         />
                        <SmallText className="text-gray-500 dark:text-gray-400">
                            Minimum: 0.5%. Values will be logged when they change by ± this percentage.
                        </SmallText>
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="end-date-picker">End date</Label>
                    <DatePicker
                        id="end-date-picker"
                        mode="single"
                        placeholder="End date"
                        dateFormat="Y-m-d H:i"
                        enableTime={true}
                        disablePast={true}
                        defaultDate={endDate ? new Date(endDate) : ""} // Varsayılan olarak yarın
                        onChange={(selectedDates: Date[]) => {
                            console.log("selectedDates", selectedDates[0].toISOString())
                            if (selectedDates && selectedDates[0]) {
                                setEndDate(selectedDates[0].toISOString());
                            }
                        }}
                    />
                </div>


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
                        {trendLog ? (saving ? "Saving..." : "Save Changes") : (saving ? "Adding..." : "Add Trend Log")}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default TrendLogForm;
