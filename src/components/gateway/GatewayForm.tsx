import React, { useState, useEffect } from "react";
import { GatewayType } from "@/app/(project)/gateway-settings/page";
import { SmallText } from "@/components/ui/typography";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { Loader2 } from "lucide-react";

interface GatewayFormProps {
    gateway?: GatewayType;
    onSubmit: (gatewayData: {
        name: string;
        connectionType: string;
        ipAddress: string;
        port: string;
        baudRate: string;
        parity: string;
        stopBits: string;
    }) => void;
    onCancel: () => void;
}

// Interface for serial port information
interface SerialPortInfo {
    path: string;
    manufacturer?: string | null;
    serialNumber?: string | null;
    pnpId?: string | null;
    vendorId?: string | null;
    productId?: string | null;
}

// API response interface
interface SerialPortsResponse {
    ports: SerialPortInfo[];
    error?: string;
    platform?: string;
}

const GatewayForm: React.FC<GatewayFormProps> = ({ gateway, onSubmit, onCancel }) => {
    const [gatewayName, setGatewayName] = useState(gateway?.name || "");
    const [connectionType, setConnectionType] = useState(gateway?.connectionType || "tcp");
    const [ipAddress, setIPAddress] = useState(gateway?.ipAddress || "");
    const [port, setPort] = useState(gateway?.port || "");
    const [baudRate, setBaudRate] = useState(gateway?.baudRate || "9600");
    const [parity, setParity] = useState(gateway?.parity || "None");
    const [stopBits, setStopBits] = useState(gateway?.stopBits || "1");
    const [ipAddressError, setIpAddressError] = useState("");
    
    // State for serial port list
    const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
    const [loadingPorts, setLoadingPorts] = useState(false);
    const [portError, setPortError] = useState("");
    const [useManualPortEntry, setUseManualPortEntry] = useState(false);
    const [platformType, setPlatformType] = useState<string>("unknown");

    // Validate IP address format
    const validateIpAddress = (ip: string) => {
        if (connectionType !== "tcp") return true;
        if (!ip.trim()) return false;
        
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    };


    const handleIpAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setIPAddress(value);
        if (value && !validateIpAddress(value)) {
            setIpAddressError("Please enter a valid IP address");
        } else {
            setIpAddressError("");
        }
    };

    // Load serial ports from API
    useEffect(() => {
        // Only load ports if serial connection type is selected and not in edit mode
        if (connectionType === "serial") {
            fetchSerialPorts();
        }
    }, [connectionType]);

    // API call to fetch serial ports
    const fetchSerialPorts = async () => {
        if (loadingPorts) return;
        
        setLoadingPorts(true);
        setPortError("");
        
        try {
            const response = await fetch('/api/serial-ports');
            const data: SerialPortsResponse = await response.json();
            
            // Save platform information
            if (data.platform) {
                setPlatformType(data.platform);
                console.log(`Detected platform: ${data.platform}`);
            }
            
            if (data.ports && Array.isArray(data.ports)) {
                setSerialPorts(data.ports);
                
                // If port list is empty, switch to manual entry
                if (data.ports.length === 0) {
                    setUseManualPortEntry(true);
                    setPortError("No available serial ports found. Please enter the port name manually.");
                } else {
                    setUseManualPortEntry(false);
                    
                    // If there's no current port value, select the first port
                    if (!port && data.ports.length > 0) {
                        setPort(data.ports[0].path);
                        
                        // Log successful port detection
                        console.log("Successfully detected serial ports:", data.ports.map((p: SerialPortInfo) => p.path).join(", "));
                    }
                }
            } else {
                setUseManualPortEntry(true);
                setPortError("Could not retrieve port list. Please enter the port name manually.");
            }
            
            // Handle any API error more gracefully
            if (data.error) {
                console.error("Serial port detection error:", data.error);
                
                // Show a simplified user-friendly error
                if (data.error.includes("native build") || data.error.includes("No native")) {
                    setPortError("Port auto-detection is not available. Please enter the port name manually.");
                } else {
                    setPortError(`Could not detect ports: ${data.error.split(':')[0]}`);
                }
                
                setUseManualPortEntry(true);
            }
        } catch (error) {
            console.error("Failed to fetch serial ports:", error);
            setPortError("Could not connect to port detection service. Please enter the port name manually.");
            setUseManualPortEntry(true);
        } finally {
            setLoadingPorts(false);
        }
    };

    // Toggle manual port entry
    const toggleManualEntry = () => {
        setUseManualPortEntry(!useManualPortEntry);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Form validation
        if (!gatewayName) {
            return; // Name is required
        }

        if (connectionType === "tcp" && !validateIpAddress(ipAddress)) {
            setIpAddressError("Please enter a valid IP address");
            return;
        }

        onSubmit({
            name: gatewayName,
            connectionType: connectionType,
            ipAddress: connectionType === "tcp" ? ipAddress : "",
            port: port,
            baudRate: connectionType === "serial" ? baudRate : "",
            parity: connectionType === "serial" ? parity : "",
            stopBits: connectionType === "serial" ? stopBits : "",
        });
    };

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-6 text-blue-600 dark:text-blue-400">
                {gateway ? "Edit GATEWAY" : "Add New GATEWAY"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* gateway Name */}
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <InputField
                        id="name"
                        placeholder="gateway Name"
                        value={gatewayName}
                        onChange={(e) => setGatewayName(e.target.value)}
                    />
                </div>

                {/* Connection Type */}
                <div className="space-y-2">
                    <Label htmlFor="connectionType">Connection Type</Label>
                    <Select 
                        options={[
                            { value: "serial", label: "Serial (gateway)" },
                            { value: "tcp", label: "IP Gateway" }
                        ]}
                        onChange={(value) => setConnectionType(value)}
                        defaultValue={connectionType}
                    />
                </div>

                {/* IP Address - Only for TCP */}
                {connectionType === "tcp" && (
                    <div className="space-y-2">
                        <Label htmlFor="ipAddress">IP Address</Label>
                        <InputField
                            id="ipAddress"
                            placeholder="192.168.1.1"
                            value={ipAddress}
                            onChange={handleIpAddressChange}
                            className={ipAddressError ? "border-red-500" : ""}
                        />
                        {ipAddressError && (
                            <SmallText className="text-red-500">{ipAddressError}</SmallText>
                        )}
                    </div>
                )}

                {/* Port */}
                <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    
                    {connectionType === "tcp" ? (
                        <InputField
                            id="port"
                            type="number"
                            placeholder="502"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                        />
                    ) : loadingPorts ? (
                        <div className="flex items-center space-x-2 h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700">
                            <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                Detecting serial ports...
                            </span>
                        </div>
                    ) : useManualPortEntry || serialPorts.length === 0 ? (
                        <div className="space-y-2">
                            <InputField
                                id="port"
                                type="text"
                                placeholder="COM3"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                            />
                            {serialPorts.length > 0 && (
                                <button
                                    type="button"
                                    onClick={toggleManualEntry}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Back to automatic port selection
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Select
                                options={serialPorts.map(port => ({
                                    value: port.path,
                                    label: `${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ''}`
                                }))}
                                onChange={(value) => setPort(value)}
                                defaultValue={port || (serialPorts.length > 0 ? serialPorts[0].path : '')}
                            />
                            <button
                                type="button"
                                onClick={toggleManualEntry}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Manual port entry
                            </button>
                            <button
                                type="button"
                                onClick={fetchSerialPorts}
                                className="ml-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Refresh port list
                            </button>
                        </div>
                    )}
                    
                    {portError && (
                        <SmallText className="text-amber-500">
                            {portError}
                            {portError.includes("not available") && (
                                <span className="block mt-1 text-gray-500">
                                    {platformType === "win32" ? (
                                        "Common port names: COM1, COM2, COM3, COM4"
                                    ) : platformType === "linux" ? (
                                        "Common port names: /dev/ttyS0, /dev/ttyUSB0, /dev/ttyACM0"
                                    ) : platformType === "darwin" ? (
                                        "Common port names: /dev/tty.usbserial, /dev/cu.usbmodem"
                                    ) : (
                                        "Enter the port name for your serial device"
                                    )}
                                </span>
                            )}
                        </SmallText>
                    )}
                </div>

                {/* Serial-specific options */}
                {connectionType === "serial" && (
                    <>
                        {/* Baud Rate */}
                        <div className="space-y-2">
                            <Label htmlFor="baudRate">Baud Rate</Label>
                            <InputField
                                id="baudRate"
                                type="number"
                                placeholder="9600"
                                value={baudRate}
                                onChange={(e) => setBaudRate(e.target.value)}
                            />
                        </div>

                        {/* Parity */}
                        <div className="space-y-2">
                            <Label htmlFor="parity">Parity</Label>
                            <Select
                                options={[
                                    { value: "None", label: "None" },
                                    { value: "Even", label: "Even" },
                                    { value: "Odd", label: "Odd" }
                                ]}
                                onChange={(value) => setParity(value)}
                                defaultValue={parity}
                            />
                        </div>

                        {/* Stop Bits */}
                        <div className="space-y-2">
                            <Label>Stop Bits</Label>
                            <Select
                                options={[
                                    { value: "1", label: "1" },
                                    { value: "2", label: "2" }
                                ]}
                                onChange={(value) => setStopBits(value)}
                                defaultValue={stopBits}
                            />
                        </div>
                    </>
                )}

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
                        {gateway ? "Save Changes" : "Add gateway"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GatewayForm;
