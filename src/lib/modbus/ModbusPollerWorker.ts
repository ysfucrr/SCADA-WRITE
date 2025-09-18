/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/modbus/ModbusPollerWorker.ts
import { parentPort } from "worker_threads";
import { PollingEngine } from "./PollingEngine";
import { backendLogger, LogMessage } from "../logger/BackendLogger";

if (!parentPort) {
  throw new Error("This file is intended to be run as a worker thread.");
}

backendLogger.info("Worker thread started.", "Worker");

const engine = new PollingEngine();

// Worker loglarını ana thread'e yönlendir
backendLogger.redirectLogsTo((log: LogMessage) => {
  parentPort?.postMessage({ type: 'log', payload: log });
});

engine.on('registerUpdated', (payload) => {
  parentPort?.postMessage({ type: 'registerUpdated', payload });
});

engine.on('connectionStatusChanged', (payload) => {
  parentPort?.postMessage({ type: 'connectionStatusChanged', payload });
});

parentPort.on('message', async (message: { type: string, payload: any }) => {
    const { type, payload } = message;

    switch (type) {
        case 'START_POLLING':
             try {
                if (payload.analyzers && payload.registers) {
                    await engine.initialize(payload.analyzers, payload.registers);
                    backendLogger.info("Polling engine initialized and started successfully in worker.", "Worker");
                } else {
                    backendLogger.warning("START_POLLING command received without necessary payload.", "Worker");
                }
            } catch (error) {
                backendLogger.error("Worker failed to initialize polling engine.", "Worker", { error: (error as Error).message });
            }
            break;
        
        case 'CLEAR_CONFIG':
             // `payload` burada yeni analyzer konfigürasyonunu içerecek
             await engine.clearConfiguration(payload.analyzers || []);
             parentPort?.postMessage({ type: 'CONFIG_CLEARED' });
             break;

        case 'UPDATE_ANALYZER_REGISTERS':
            if (payload.analyzerId && payload.registers) {
                engine.updateSpecificAnalyzer(payload.analyzerId, payload.registers);
            } else {
                backendLogger.warning("UPDATE_ANALYZER_REGISTERS command received without necessary payload.", "Worker");
            }
            break;

        case 'UPDATE_ANALYZER_PROPERTIES':
            if (payload.analyzerId && payload.newProps) {
                engine.updateAnalyzerProperties(payload.analyzerId, payload.newProps);
            } else {
                backendLogger.warning("UPDATE_ANALYZER_PROPERTIES command received without necessary payload.", "Worker");
            }
            break;

        case 'REMOVE_ANALYZER':
            if (payload.analyzerId) {
                engine.removeAnalyzer(payload.analyzerId);
            } else {
                backendLogger.warning("REMOVE_ANALYZER command received without necessary payload.", "Worker");
            }
            break;


        default:
            backendLogger.warning(`Worker received unknown message type: ${type}`, "Worker");
            break;
    }
});

//backendLogger.info("Worker is initialized and listening for messages.", "Worker");