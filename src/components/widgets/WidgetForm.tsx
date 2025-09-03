import { WidgetType } from "@/app/(project)/dashboard/page";
import { TrendLogType } from "@/app/(project)/trend-log/page";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { useAuth } from "@/hooks/use-auth";
import { Building, DoorOpen, Layers } from "lucide-react";
import React, { useEffect, useState } from "react";
import { NumericFormat } from "react-number-format";
import { DeleteButton } from "../ui/action-buttons";
import { showToast } from "../ui/alert";
import { TrendLogTreeDropdown } from "./TrendLogDropdown";

interface WidgetFormProps {
    widget?: WidgetType;
    onSubmit: (widgetData: {
        name: string;
        price: number;
        currency: string;
        trendLogsData: TrendLogType[];
    }) => void;
    onCancel: () => void;
}

const WidgetForm: React.FC<WidgetFormProps> = ({ widget, onSubmit, onCancel }) => {
    console.log("widget: ", widget)
    const [widgetName, setWidgetName] = useState(widget?.name || "");
    const [price, setPrice] = useState(widget?.price || 0);
    const [currency, setCurrency] = useState(widget?.currency || "TL");
    const [kwhCounters, setKwhCounters] = useState([]);
    const { isAdmin } = useAuth();
    const [trendLogs, setTrendLogs] = useState<TrendLogType[]>([]);
    const editMode = widget !== undefined;
    const fetchAnalyzers = async () => {
        try {
            const response = await fetch(`/api/analyzers`);
            const data = await response.json();
            return data
        } catch (error) {
            console.error("Error fetching analyzers:", error);
            return []
        }
    };
    const fetchRTUs = async () => {
        try {
            const response = await fetch(`/api/RTUs`);
            const data = await response.json();
            console.log("rtus: ", data)
            return data
        } catch (error) {
            console.error("Error fetching rtus:", error);
            return []
        }
    };

    const fetchBuildings = async () => {
        try {
            const response = await fetch(`/api/units`);
            const data = await response.json();
            return data.buildings
        } catch (error) {
            console.error("Error fetching buildings:", error);
            return []
        }
    };
    const fetchKwhCounters = async (analyzers: any, rtus: any, buildings: any) => {
        try {
            const allRegisterNodes: any = []
            for (let i = 0; i < buildings.length; i++) {
                const building = buildings[i]
                if (building.flowData && building.flowData.nodes) {
                    allRegisterNodes.push(...building.flowData.nodes.filter((node: any) => node.type === "registerNode").map((node: any) => ({
                        ...node,
                        building: building.name,
                        unit: <div className="flex items-center gap-1">
                            {building.icon ? <div className="relative h-4 w-4">
                                <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                            </div> : <Building className="h-4 w-4" />}
                            <span>{building.name}</span>
                        </div>
                    })))
                }
                if (building.floors && building.floors.length > 0) {
                    for (let j = 0; j < building.floors.length; j++) {
                        const floor = building.floors[j]
                        if (floor.flowData && floor.flowData.nodes) {
                            allRegisterNodes.push(...floor.flowData.nodes.filter((node: any) => node.type === "registerNode").map((node: any) => ({
                                ...node,
                                building: building.name,
                                floor: floor.name,
                                unit: <div className="flex items-center gap-1">
                                    {building.icon ? <div className="relative h-4 w-4">
                                        <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                    </div> : <Building className="h-4 w-4" />}
                                    <span>{building.name}</span>
                                    {floor.icon ? <div className="relative h-4 w-4">
                                        <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
                                    </div> : <Layers className="h-4 w-4" />}
                                </div>
                            })))
                        }
                        if (floor.rooms && floor.rooms.length > 0) {
                            for (let k = 0; k < floor.rooms.length; k++) {
                                const room = floor.rooms[k]
                                if (room.flowData && room.flowData.nodes) {
                                    allRegisterNodes.push(...room.flowData.nodes.filter((node: any) => node.type === "registerNode").map((node: any) => ({
                                        ...node,
                                        building: building.name,
                                        floor: floor.name,
                                        room: room.name,
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
                                        </div>
                                    })))
                                }
                            }
                        }
                    }
                }
            }
            const response = await fetch(`/api/trend-logs?isKWHCounter=true`);
            const data = await response.json();
            //console.log("allRegisterNodes", allRegisterNodes)
            for (let i = 0; i < data.length; i++) {
                const analyzer = analyzers.find((analyzer: any) => analyzer._id === data[i].analyzerId);
                const rtu = rtus.find((rtu: any) => rtu._id === analyzer.gateway);
                data[i].analyzer = analyzer
                data[i].rtu = rtu;
                data[i].register = allRegisterNodes.find((register: any) => register.id === data[i].registerId);
                data[i].building = allRegisterNodes.find((register: any) => register.id === data[i].registerId).building;
                data[i].floor = allRegisterNodes.find((register: any) => register.id === data[i].registerId).floor;
                data[i].room = allRegisterNodes.find((register: any) => register.id === data[i].registerId).room;
                data[i].unit = allRegisterNodes.find((register: any) => register.id === data[i].registerId).unit;
            }
            console.log("data", data)
            setKwhCounters(data);
            if (widget) {
                setTrendLogs(data.filter((kwhCounter: any) => widget.trendLogs.map((trendLog: any) => trendLog.registerId).includes(kwhCounter.registerId)));
            }
        } catch (error) {
            console.error("Error fetching kwh counters:", error);
        }
    };
    useEffect(() => {
        fetchBuildings().then((buildings) => {
            fetchRTUs().then((rtus) => {
                fetchAnalyzers().then((analyzers) => {
                    fetchKwhCounters(analyzers, rtus, buildings);
                });
            });
        });
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (trendLogs.length === 0) {
            showToast("At least one trend log is required", "error");
            return null;
        }
        console.warn("form submit called")
        // Form validation
        if (!widgetName) {
            return; // Name is required
        }

        onSubmit({
            name: widgetName,
            price: price,
            currency: currency,
            trendLogsData: trendLogs.filter((trendLog: any) => trendLog.registerId),
        });
    };

    const addTrendLog = () => {
        setTrendLogs([...trendLogs, {} as TrendLogType]);
    };



    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-6 text-blue-600 dark:text-blue-400">
                {widget ? "Edit Widget" : "Add New Widget"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Widget Name */}
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <InputField
                        id="name"
                        placeholder="Widget Name"
                        value={widgetName}
                        onChange={(e) => setWidgetName(e.target.value)}
                    />
                </div>

                {/* Currency */}
                <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                        options={[
                            { value: "TRY", label: "₺ TL" },
                            { value: "USD", label: "$ USD" },
                            { value: "EUR", label: "€ EUR" },
                            { value: "CFAO", label: "CFAO" }
                        ]}
                        onChange={(value) => setCurrency(value)}
                        defaultValue={currency}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="price">Price</Label>
                    <NumericFormat
                        id="price"
                        value={price}
                        onValueChange={(values: { floatValue?: number }) => {
                            const { floatValue } = values;
                            console.log("values: ", values)
                            setPrice(floatValue || 0);
                        }}
                        decimalScale={2} // 2 ondalık basamak
                        fixedDecimalScale={false} // Sonda 0 gösterme
                        allowNegative={false} // Negatif değerlere izin verme
                        thousandSeparator={true}
                        decimalSeparator="." // Ondalık ayracı nokta olarak ayarla
                        placeholder="Price"
                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                    />

                </div>
                <div className="space-y-2">
                    <Label>Trend Logs</Label>
                    <div className="w-full flex flex-col gap-1">
                        {trendLogs.map((trendLog, index) => {
                            console.log("trendLog", trendLog)
                            return (

                                <div key={index} className="flex items-center justify-between">

                                    <TrendLogTreeDropdown
                                        key={index}
                                        kwhCounters={!widget ? kwhCounters.filter((kwhCounter: any) => !trendLogs.map((trendLog: any) => trendLog.registerId).includes(kwhCounter.registerId)) : kwhCounters.filter((kwhCounter: any) => !trendLogs.map((trendLog: any) => trendLog.registerId).includes(kwhCounter.registerId)).concat(kwhCounters.filter((kwhCounter: any) => trendLog.registerId == kwhCounter.registerId))}
                                        index={index}
                                        value={trendLog}
                                        // disabled={!isAdmin}
                                        onChange={(value) => {
                                            console.log("trendLogs", trendLogs)
                                            console.log("kwh counters", kwhCounters)
                                            console.log("value", value)
                                            const newTrendLogs = [...trendLogs];
                                            newTrendLogs[index] = value;
                                            setTrendLogs(newTrendLogs);
                                        }}
                                    />
                                    {isAdmin && (
                                        <DeleteButton
                                            onClick={(e) => {
                                                e?.stopPropagation();
                                                e?.preventDefault();
                                                const newTrendLogs = [...trendLogs];
                                                newTrendLogs.splice(index, 1);
                                                setTrendLogs(newTrendLogs);
                                            }}
                                            size="md"
                                            shape="circle"
                                            className="ml-2"
                                        />
                                    )}
                                </div>

                            )
                        })}
                    </div>
                    {isAdmin && (
                        <button type="button" onClick={() => addTrendLog()} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                            Add Trend Log
                        </button>
                    )}
                </div>



                <div className="flex items-center justify-end space-x-3 mt-8">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                        {widget ? "Save Changes" : "Add Widget"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default WidgetForm;
