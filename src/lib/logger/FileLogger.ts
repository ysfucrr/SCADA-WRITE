import * as fs from 'fs';
import * as path from 'path';
export class FileLogger {
    private logFile: string;
    private logDir: string;

    constructor(appName = 'scada-dashboard', fileName = 'service-debug.log') {
        // Electron'a bağımlılığı kaldır, platforma göre path belirle
        let userDataPath: string;
        if (process.env.APPDATA) { // Windows
            userDataPath = process.env.APPDATA;
        } else if (process.platform === 'darwin') { // macOS
            userDataPath = path.join(process.env.HOME!, 'Library', 'Application Support');
        } else { // Linux
            userDataPath = path.join(process.env.HOME!, '.config');
        }

        this.logDir = path.join(userDataPath, appName, 'logs');
        this.logFile = path.join(this.logDir, fileName);
        
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