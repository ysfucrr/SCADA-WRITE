import { AnalyzerType } from "@/app/(project)/analyzers/page";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { ChevronDown } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface AnalyzerFormProps {
    analyzer?: AnalyzerType;
    onSubmit: (analyzerData: {
        name: string;
        slaveId: string;
        model: string;
        poll: string;
        timeout: string;
        ctRadio: string;
        vtRadio: string;
        connection: string;
        gateway: string;
        unit: string;
    }) => void;
    onCancel: () => void;
}

interface Building {
    _id: string;
    id: string;
    name: string;
    floors: Floor[];
}

interface Floor {
    _id: string;
    id: string;
    name: string;
    rooms: Room[];
}

interface Room {
    _id: string;
    id: string;
    name: string;
}
const AnalyzerForm: React.FC<AnalyzerFormProps> = ({ analyzer, onSubmit, onCancel }) => {
    const [analyzerName, setAnalyzerName] = useState(analyzer?.name || "");
    const [slaveId, setSlaveId] = useState(analyzer?.slaveId || "");
    const [model, setModel] = useState(analyzer?.model || "");
    const [poll, setPoll] = useState(analyzer?.poll || "");
    const [timeout, setTimeout] = useState(analyzer?.timeout || "");
    const [ctRadio, setCTRadio] = useState(analyzer?.ctRadio || "");
    const [vtRadio, setVTRadio] = useState(analyzer?.vtRadio || "");
    const [connection, setConnection] = useState(analyzer?.connection || "serial");
    const [gateway, setGateway] = useState(analyzer?.gateway || "");
    const [isLoading, setIsLoading] = useState(true);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [unit, setUnit] = useState('');
    const [rtus, setRTUs] = useState<any[]>([]);

    useEffect(() => {
       console.log("gateway changed: ", gateway)
    }, [gateway]);

    const fetchRTUs = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/RTUs');
            const data = await response.json();
            if (typeof data === 'object' ) {
                setRTUs(data);
            } else {
                console.error('Failed to fetch rtus:', data.message);
            }
        } catch (error) {
            console.error('Error fetching rtus:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBuildings = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/units');
            const data = await response.json();

            if (data.success) {
                setBuildings(data.buildings);
            } else {
                console.error('Failed to fetch buildings:', data.message);
            }
        } catch (error) {
            console.error('Error fetching buildings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});

    const handleSubmit = (e: React.FormEvent) => {
        console.log('Form submitted:', { analyzerName, slaveId, model, poll, timeout, ctRadio, vtRadio, connection, gateway, unit });
        e.preventDefault();

        // Form validation
        const errors: {[key: string]: string} = {};
        
        if (!analyzerName) {
            errors.name = "Analyzer name is required";
        }
        
        if (!gateway) {
            errors.gateway = "Gateway selection is required";
        }

        // Hata varsa form gönderimini engelle
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        // Hata yoksa formu gönder
        setFormErrors({});
        onSubmit({
            name: analyzerName,
            slaveId: slaveId,
            model: model,
            poll: poll,
            timeout: timeout,
            ctRadio: ctRadio,
            vtRadio: vtRadio,
            connection: connection,
            gateway: gateway,
            unit: unit
        });
    };

    const connectionTypeOptions = [
        { value: "serial", label: "Serial (Analyzer)" },
        { value: "tcp", label: "TCP / Ethernet (Gateway)" }
    ];
    // const [serialConnectionOptions, setSerialConnectionOptions] = useState<{value:string, label:string}[]>([]);
    // const [tcpConnectionOptions, setTcpConnectionOptions] = useState<{value:string, label:string}[]>([]);

    useEffect(() => {
        if (rtus.length === 0) return;
        if (!connection) return;
        const serialOptions = rtus.filter((rtu: any) => rtu.connectionType === "serial").map((rtu: any) => ({ value: rtu._id, label: rtu.name }));
        const tcpOptions = rtus.filter((rtu: any) => rtu.connectionType === "tcp").map((rtu: any) => ({ value: rtu._id, label: rtu.name }));
        
        // setSerialConnectionOptions(serialOptions);
        // setTcpConnectionOptions(tcpOptions);
        
        // Bağlantı tipine göre mevcut seçenekleri belirle
        const currentOptions = connection === "serial" ? serialOptions : tcpOptions;
        
        // Reset gateway value when connection type changes
        const isValidGateway = currentOptions.some((option: any) => option.value === gateway);
        if (!isValidGateway) {
            // If current gateway is not valid for the new connection type, reset it
            setGateway(currentOptions.length > 0 ? currentOptions[0].value : "");
        }
    }, [rtus, connection, gateway]);

    // Reset gateway when connection type changes
    useEffect(() => {
        if (rtus.length === 0) return;
        
        // When editing an analyzer and connection type changes, reset the gateway
        if (analyzer && connection !== analyzer.connection) {
            const options = connection === "serial"
                ? rtus.filter((rtu: any) => rtu.connectionType === "serial").map((rtu: any) => ({ value: rtu._id, label: rtu.name }))
                : rtus.filter((rtu: any) => rtu.connectionType === "tcp").map((rtu: any) => ({ value: rtu._id, label: rtu.name }));
            
            setGateway(options.length > 0 ? options[0].value : "");
        }
    }, [connection, rtus, analyzer]);

    useEffect(() => {
        fetchBuildings();
        fetchRTUs();

    }, []);
    const handleNavigationItemClick = (unit: string) => {
        setUnit(unit);
        setIsDropdownOpen(false);
    };
    const getSelectedItemName = () => {
        if (!unit) return "Select Navigation Target";

        // URL'den ID'leri ayıkla
        const parts = unit.split('/').filter(p => p);

        if (parts.length === 0) return "Select Navigation Target";

        // Bina ID'si
        const buildingId = parts[0];
        const building = buildings.find(b => b._id === buildingId || b.id === buildingId);

        if (!building) return "Select Navigation Target";

        // Sadece bina seçilmişse
        if (parts.length === 1) return building.name;

        // Kat ID'si
        const floorId = parts[1];
        const floor = building.floors.find(f => f._id === floorId || f.id === floorId);

        if (!floor) return building.name;

        // Sadece kat seçilmişse
        if (parts.length === 2) return `${building.name} > ${floor.name}`;

        // Oda ID'si
        const roomId = parts[2];
        const room = floor.rooms.find(r => r._id === roomId || r.id === roomId);

        if (!room) return `${building.name} > ${floor.name}`;

        return `${building.name} > ${floor.name} > ${room.name}`;
    };

    // Bina render fonksiyonu
    const renderBuilding = (building: Building) => {
        const buildingUrl = `/${building._id}`;

        return (
            <div key={building._id} className="navigation-item">
                <div
                    className={`flex items-center p-2 cursor-pointer hover:bg-gray-100 ${unit === buildingUrl ? 'bg-blue-100' : ''}`}
                    onClick={() => handleNavigationItemClick(buildingUrl)}
                >
                    <span className="font-medium">{building.name}</span>
                </div>

                {/* Katlar */}
                <div className="">
                    {building.floors.map(floor => renderFloor(floor, building))}
                </div>
            </div>
        );
    };
    // Kat render fonksiyonu
    const renderFloor = (floor: Floor, building: Building) => {
        const floorUrl = `/${building._id}/${floor.id}`;

        return (
            <div key={floor.id} className="navigation-item">
                <div
                    className={`pl-6 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${unit === floorUrl ? 'bg-blue-100' : ''}`}
                    onClick={() => handleNavigationItemClick(floorUrl)}
                >
                    {/* <ChevronRight size={16} className="mr-1" /> */}
                    <span>{floor.name}</span>
                </div>

                {/* Odalar */}
                <div className="">
                    {floor.rooms.map(room => renderRoom(room, building, floor))}
                </div>
            </div>
        );
    };

    // Oda render fonksiyonu
    const renderRoom = (room: Room, building: Building, floor: Floor) => {
        const roomUrl = `/${building._id}/${floor.id}/${room.id}`;

        return (
            <div
                key={room.id}
                className={`pl-12 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${unit === roomUrl ? 'bg-blue-100' : ''}`}
                onClick={() => handleNavigationItemClick(roomUrl)}
            >
                {/* <ChevronRight size={16} className="mr-1" /> */}
                {/* <ChevronRight size={16} className="mr-1" /> */}
                <span className="mr-1">{room.name}</span>
            </div>
        );
    };
    // Tüm navigasyon menüsünü render et
    const renderNavigationDropdown = () => {
        return (
            <div className="relative w-full">
                <div
                    className="flex items-center justify-between p-2 border rounded-md cursor-pointer"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <span className="text-sm">{getSelectedItemName()}</span>
                    <ChevronDown size={16} />
                </div>

                {isDropdownOpen && (
                    <div
                        ref={dropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto"
                    >
                        <div
                            className="p-2 cursor-pointer hover:bg-gray-100"
                            onClick={() => handleNavigationItemClick('')}
                        >
                            Select Navigation Target
                        </div>
                        <div className="border-t">
                            {buildings.map(building => renderBuilding(building))}
                        </div>
                    </div>
                )}
            </div>
        );
    };
    return (
        <div className="p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6 text-blue-600 dark:text-blue-400">
                {analyzer ? "Edit Analyzer" : "Add New Analyzer"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Analyzer Name - Tek başına en üstte */}
                <div className="space-y-2">
                    <div className="flex items-center">
                        <Label htmlFor="name">Name</Label>
                        <span className="text-red-500 ml-1">*</span>
                    </div>
                    <InputField
                        id="name"
                        placeholder="Analyzer Name"
                        value={analyzerName}
                        onChange={(e) => setAnalyzerName(e.target.value)}
                    />
                    {formErrors.name && (
                        <p className="text-sm text-red-500 mt-1">{formErrors.name}</p>
                    )}
                </div>
                
                {/* İki sütunlu alanlar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Slave ID */}
                    <div className="space-y-2">
                        <Label htmlFor="slaveId">Slave ID</Label>
                        <InputField
                            id="slaveId"
                            placeholder="Slave ID"
                            value={slaveId}
                            onChange={(e) => setSlaveId(e.target.value)}
                        />
                    </div>
                    
                    {/* Analyzer Model */}
                    <div className="space-y-2">
                        <Label htmlFor="model">Analyzer Model</Label>
                        <InputField
                            id="model"
                            placeholder="Analyzer Model"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                        />
                    </div>
                    
                    {/* Poll */}
                    <div className="space-y-2">
                        <Label htmlFor="poll">Poll (ms)</Label>
                        <InputField
                            id="poll"
                            placeholder="1000"
                            value={poll}
                            onChange={(e) => setPoll(e.target.value)}
                        />
                    </div>
                    
                    {/* Timeout */}
                    <div className="space-y-2">
                        <Label htmlFor="timeout">Timeout (ms)</Label>
                        <InputField
                            id="timeout"
                            placeholder="1000"
                            value={timeout}
                            onChange={(e) => setTimeout(e.target.value)}
                        />
                    </div>
                    
                    {/* CT Radio */}
                    <div className="space-y-2">
                        <Label htmlFor="ctRadio">CT Radio</Label>
                        <InputField
                            id="ctRadio"
                            placeholder="CT Radio"
                            value={ctRadio}
                            onChange={(e) => setCTRadio(e.target.value)}
                        />
                    </div>
                    
                    {/* VT Radio */}
                    <div className="space-y-2">
                        <Label htmlFor="vtRadio">VT Radio</Label>
                        <InputField
                            id="vtRadio"
                            placeholder="VT Radio"
                            value={vtRadio}
                            onChange={(e) => setVTRadio(e.target.value)}
                        />
                    </div>
                    
                    {/* Connection Type */}
                    <div className="space-y-2">
                        <Label htmlFor="connectionType">Connection Type</Label>
                        <Select
                            options={connectionTypeOptions}
                            onChange={(value) => setConnection(value)}
                            defaultValue={connection}
                        />
                    </div>
                    
                    {/* Gateway Type */}
                    <div className="space-y-2">
                        <div className="flex items-center">
                            <Label htmlFor="gateway">Gateway</Label>
                            <span className="text-red-500 ml-1">*</span>
                        </div>
                        <Select
                            options={connection === "serial"
                                ? rtus.filter((rtu: any) => rtu.connectionType === "serial").map((rtu: any) => ({ value: rtu._id, label: rtu.name }))
                                : rtus.filter((rtu: any) => rtu.connectionType === "tcp").map((rtu: any) => ({ value: rtu._id, label: rtu.name }))}
                            onChange={(value) => setGateway(value)}
                            defaultValue={gateway}
                            key={`gateway-select-${connection}`} // Add key to force re-render when connection changes
                        />
                        {formErrors.gateway && (
                            <p className="text-sm text-red-500 mt-1">{formErrors.gateway}</p>
                        )}
                    </div>
                </div>
                
                {/* Navigation - Tek başına */}
                {/* <div className="space-y-2">
                    <Label htmlFor="navigationUrl">Navigation</Label>
                    <div className="w-full">
                        {isLoading ? (
                            <div className="flex h-10 w-full items-center justify-center border border-input rounded-md bg-background">
                                <span className="text-sm text-gray-500">Loading...</span>
                            </div>
                        ) : (
                            renderNavigationDropdown()
                        )}
                    </div>
                </div> */}
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
                        {analyzer ? "Save Changes" : "Add Analyzer"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AnalyzerForm;
