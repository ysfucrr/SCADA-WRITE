import React, { useState, useEffect } from "react";
import { RTUType } from "@/app/(project)/rtu-settings/page";
import { SmallText } from "@/components/ui/typography";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Select from "@/components/form/Select";

interface RTUFormProps {
    rtu?: RTUType;
    onSubmit: (rtuData: {
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

const RTUForm: React.FC<RTUFormProps> = ({ rtu, onSubmit, onCancel }) => {
    const [rtuName, setRTUName] = useState(rtu?.name || "");
    const [connectionType, setConnectionType] = useState(rtu?.connectionType || "tcp");
    const [ipAddress, setIPAddress] = useState(rtu?.ipAddress || "");
    const [port, setPort] = useState(rtu?.port || "");
    const [baudRate, setBaudRate] = useState(rtu?.baudRate || "9600");
    const [parity, setParity] = useState(rtu?.parity || "None");
    const [stopBits, setStopBits] = useState(rtu?.stopBits || "1");
    const [ipAddressError, setIpAddressError] = useState("");

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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Form validation
        if (!rtuName) {
            return; // Name is required
        }

        if (connectionType === "tcp" && !validateIpAddress(ipAddress)) {
            setIpAddressError("Please enter a valid IP address");
            return;
        }

        onSubmit({
            name: rtuName,
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
                {rtu ? "Edit GATEWAY" : "Add New GATEWAY"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* RTU Name */}
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <InputField
                        id="name"
                        placeholder="RTU Name"
                        value={rtuName}
                        onChange={(e) => setRTUName(e.target.value)}
                    />
                </div>

                {/* Connection Type */}
                <div className="space-y-2">
                    <Label htmlFor="connectionType">Connection Type</Label>
                    <Select 
                        options={[
                            { value: "serial", label: "Serial (RTU)" },
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
                    <InputField
                            id="port"
                            type={connectionType === "tcp" ? "number" : "text"}
                            placeholder={connectionType === "tcp" ? "502" : "COM3"}
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                        />
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
                        {rtu ? "Save Changes" : "Add RTU"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RTUForm;
