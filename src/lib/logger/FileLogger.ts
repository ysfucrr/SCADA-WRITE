import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export class FileLogger {
    private logFile: string;
    private logDir: string;

    constructor() {
        // Electron app path'i al, yoksa fallback kullan
        let userDataPath: string;
        try {
            userDataPath = app ? app.getPath('userData') : process.env.APPDATA || process.cwd();
        } catch {
            userDataPath = process.env.APPDATA || process.cwd();
        }

        this.logDir = path.join(userDataPath, 'logs');
        this.logFile = path.join(this.logDir, 'service-debug.log');
        
        // Log klasörünü oluştur
        this.ensureLogDir();
        
        // Başlangıç mesajı
        this.log('INFO', 'FileLogger initialized', { logFile: this.logFile });
    }

    private ensureLogDir(): void {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }

    public log(level: string, message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data: data || {}
        };

        const logLine = `${timestamp} [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
        
        try {
            // Console'a da yazdır
            console.log(`[FILE-LOG] ${logLine.trim()}`);
            
            // Dosyaya yaz
            fs.appendFileSync(this.logFile, logLine, { encoding: 'utf8' });
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    public error(message: string, data?: any): void {
        this.log('ERROR', message, data);
    }

    public warn(message: string, data?: any): void {
        this.log('WARN', message, data);
    }

    public info(message: string, data?: any): void {
        this.log('INFO', message, data);
    }

    public debug(message: string, data?: any): void {
        this.log('DEBUG', message, data);
    }

    public getLogPath(): string {
        return this.logFile;
    }

    public clearLog(): void {
        try {
            fs.writeFileSync(this.logFile, '', { encoding: 'utf8' });
            this.info('Log file cleared');
        } catch (error) {
            console.error('Failed to clear log file:', error);
        }
    }
}

// Global instance
export const fileLogger = new FileLogger();