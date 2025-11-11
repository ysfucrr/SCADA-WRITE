import { Server, Namespace, Socket } from "socket.io";

/**
 * Log seviyelerini tanımlayan enum
 */
export enum LogLevel {
  ERROR = "ERROR",
  WARNING = "WARNING",
  INFO = "INFO",
  DEBUG = "DEBUG"
}

/**
 * Log mesaj yapısını tanımlayan interface
 */
export interface LogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  source: string;
  details?: Record<string, unknown>;
}

/**
 * Log filtresi için kullanılan interface
 */
export interface LogFilter {
  level?: LogLevel | 'ALL';
  source?: string;
  search?: string;
}

/**
 * BackendLogger sınıfı, uygulamanın farklı kısımlarından log mesajları alır
 * ve bunları WebSocket üzerinden frontend'e iletir.
 */
export class BackendLogger {
  private static instance: BackendLogger;
  private io: Server | Namespace | null = null;
  private logs: LogMessage[] = [];
  // Tutulacak maksimum log sayısı - bellek sızıntısını engellemek için bir üst sınır koyduk
  private readonly maxLogEntries: number = Number(process.env.BACKEND_LOGGER_MAX_ENTRIES || 1000);
  private consoleOutput = true; // Console çıktısı aktif/pasif
  private logRedirectionCallback: ((log: LogMessage) => void) | null = null;

  /**
   * BackendLogger bir singleton olarak tasarlanmıştır.
   */
  private constructor() {
    // Private constructor
  }

  /**
   * Singleton instance'ı döndürür
   */
  public static getInstance(): BackendLogger {
    if (!BackendLogger.instance) {
      BackendLogger.instance = new BackendLogger();
    }
    return BackendLogger.instance;
  }

  /**
   * Socket.IO sunucusunu veya namespace'ini ayarlar
   * @param io Socket.IO sunucu instance'ı veya namespace'i
   */
  public setSocketIO(io: Server | Namespace): void {
    this.io = io;
    this.setupSocketIOHandlers();
  }

  /**
   * Socket.IO event dinleyicilerini ayarlar
   */
  private setupSocketIOHandlers(): void {
    if (!this.io) return;

    // Send history logs when client connects
    this.io.on("connection", (socket: Socket) => {
      // Normal durumda mevcut logları gönder
      socket.emit("logs:history", this.logs);
      
      // Log filtresi isteklerini dinle
      socket.on("logs:filter", (filters: LogFilter) => {
        const filteredLogs = this.filterLogs(filters);
        socket.emit("logs:filtered", filteredLogs);
      });
      
      // Logları temizleme isteğini dinle
      socket.on("logs:clear", () => {
        this.clearLogs();
      });
    });
  }

  /**
   * Logları filtreleme işlemi
   */
  private filterLogs(filters: LogFilter): LogMessage[] {
    let result = [...this.logs];
    
    if (filters.level && filters.level !== "ALL") {
      result = result.filter(log => log.level === filters.level);
    }
    
    if (filters.source) {
      result = result.filter(log => log.source.includes(filters.source || ''));
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      result = result.filter(log => 
        log.message.toLowerCase().includes(searchTerm) || 
        log.source.toLowerCase().includes(searchTerm) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm))
      );
    }
    
    return result;
  }

  /**
   * Console çıktısını açar veya kapatır
   * @param enabled Console çıktısı etkin mi?
   */
  public setConsoleOutput(enabled: boolean): void {
    this.consoleOutput = enabled;
  }

  /**
   * Worker thread'lerindeki logları ana thread'e yönlendirmek için kullanılır.
   * @param callback Log mesajını işleyecek olan fonksiyon
   */
  public redirectLogsTo(callback: (log: LogMessage) => void): void {
    this.logRedirectionCallback = callback;
    this.consoleOutput = false; // Yönlendirme aktifken konsola çift log basmayı önle
  }

  /**
   * Log ekler ve Socket.IO üzerinden yayınlar
   * @param level Log seviyesi
   * @param message Log mesajı
   * @param source Log kaynağı (örn. "ModbusConnection")
   * @param details Ek detaylar (JSON formatında)
   */
  public addLog(level: LogLevel, message: string, source: string, details?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logMessage: LogMessage = {
      timestamp,
      level,
      message,
      source,
      details
    };

    // Eğer bir yönlendirme callback'i ayarlanmışsa, logu oraya gönder ve işlemi bitir.
    if (this.logRedirectionCallback) {
      this.logRedirectionCallback(logMessage);
      return;
    }

    // Console çıktısı etkinse konsola da yaz
    if (this.consoleOutput) {
      const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
      switch (level) {
        case LogLevel.ERROR:
          console.error(`[${source}] ${message}${detailsStr}`);
          break;
        case LogLevel.WARNING:
          console.warn(`[${source}] ${message}${detailsStr}`);
          break;
        case LogLevel.INFO:
          console.info(`[${source}] ${message}${detailsStr}`);
          break;
        case LogLevel.DEBUG:
          console.debug(`[${source}] ${message}${detailsStr}`);
          break;
      }
    }

    // Normal durumda logları history'e ekle ve UI'ye gönder
    this.logs.push(logMessage);

    // Bellek kullanımını sınırlamak için log geçmişini maks. entries ile sınırla
    if (this.logs.length > this.maxLogEntries) {
      const excess = this.logs.length - this.maxLogEntries;
      this.logs.splice(0, excess);
    }

    // Socket.IO üzerinden yayınla
    if (this.io) {
      this.io.emit("logs:new", logMessage);
    }
  }

  /**
   * Error seviyesinde log ekler
   */
  public error(message: string, source: string, details?: Record<string, unknown>): void {
    this.addLog(LogLevel.ERROR, message, source, details);
  }

  /**
   * Warning seviyesinde log ekler
   */
  public warning(message: string, source: string, details?: Record<string, unknown>): void {
    this.addLog(LogLevel.WARNING, message, source, details);
  }

  /**
   * Info seviyesinde log ekler
   */
  public info(message: string, source: string, details?: Record<string, unknown>): void {
    this.addLog(LogLevel.INFO, message, source, details);
  }

  /**
   * Debug seviyesinde log ekler
   */
  public debug(message: string, source: string, details?: Record<string, unknown>): void {
    this.addLog(LogLevel.DEBUG, message, source, details);
  }

  /**
   * Tüm logları temizler - UI'den siler
   */
  public clearLogs(): void {
    // Backend'deki logları temizle
    this.logs = [];
    
    // UI'ye temizleme sinyali gönder
    if (this.io) {
      this.io.emit("logs:cleared");
    }
  }

  /**
   * Tüm logları döndürür
   */
  public getLogs(): LogMessage[] {
    return [...this.logs];
  }
}

// Singleton instance'ı dışa aktar
export const backendLogger = BackendLogger.getInstance();
