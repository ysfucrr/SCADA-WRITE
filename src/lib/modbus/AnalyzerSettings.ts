import { ModbusConnection } from "./ModbusConnection";
import { backendLogger } from "../logger/BackendLogger";

/**
 * AnalyzerSettings sınıfı - Analizör ayarlarını temsil eder
 */
export interface AnalyzerConfig {
    id: string;
    _id?: string;
    name?: string;
    slaveId: number;
    pollMs: number;
    timeoutMs: number;
    connType: string;
    gatewayId?: string; // Added for connection alerts
    ip?: string;
    port?: number | string;
    portName?: string;
    baudRate?: number;
    parity?: string;
    stopBits?: number;
}

export class AnalyzerSettings {
    id: string;
    name: string;
    slaveId: number;
    pollMs: number;
    timeoutMs: number;
    connType: string;
    gatewayId: string; // Added for connection alerts
    connection?: ModbusConnection;

    // TCP için
    ip?: string;
    
    //TCP ve Serial için
    port?: number | string;

    // Serial için
    baudRate?: number;
    parity?: string;
    stopBits?: number;
    portName?: string;

    constructor(config: AnalyzerConfig) {
        this.id = config.id;
        this.name = config.name || config.id;
        this.slaveId = config.slaveId;
        this.pollMs = config.pollMs;
        this.timeoutMs = config.timeoutMs;
        this.connType = config.connType;
        this.gatewayId = config.gatewayId || '';

        // TCP konfigürasyonu
        if (this.connType === 'tcp') {
            this.ip = config.ip;
            this.port = config.port;

            if (!this.ip || !this.port) {
                backendLogger.warning(`Invalid TCP configuration for analyzer ${this.id}: IP=${this.ip}, Port=${this.port}`, "AnalyzerSettings");
            }
        }
        // Serial konfigürasyonu
        else if (this.connType === 'serial') {
            this.portName = config.portName || String(config.port);
            this.baudRate = config.baudRate;
            this.parity = config.parity ? config.parity.toLowerCase() : 'none';
            this.stopBits = config.stopBits;

            if (!this.portName || !this.baudRate) {
                backendLogger.warning(`Invalid RTU configuration for analyzer ${this.id}: Port=${this.portName}, BaudRate=${this.baudRate}`, "AnalyzerSettings");
            }
            
            backendLogger.debug(`Serial config for analyzer ${this.id}: Port=${this.portName}, BaudRate=${this.baudRate}, Parity=${this.parity}, StopBits=${this.stopBits}`, "AnalyzerSettings");
        }
    }

    /**
     * Bu analizör için connection ID oluşturur
     */
    getConnectionId(): string {
        if (this.connType === 'tcp') {
            return `${this.ip}:${this.port}`;
        } else {
            return `${this.portName}@${this.baudRate}`;
        }
    }
}