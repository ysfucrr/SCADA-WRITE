"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// BackendLogger'dan LogLevel ve LogMessage tiplerini içe aktaralım
export enum LogLevel {
  ERROR = "ERROR",
  WARNING = "WARNING",
  INFO = "INFO",
  DEBUG = "DEBUG"
}

export interface LogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  source: string;
  details?: Record<string, unknown>;
}

interface LogContextType {
  logs: LogMessage[];
  isConnected: boolean;
  isPaused: boolean;
  isAutoScroll: boolean;
  setPaused: (paused: boolean) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  clearLogs: () => void;
  filterLogs: (filters: LogFilter) => LogMessage[];
  refreshLogs: () => void;
  exportLogs: () => void;
}

export interface LogFilter {
  level?: LogLevel | 'ALL';
  source?: string;
  search?: string;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const LogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogMessage[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(true);
  // Otomatik log limiti kaldırıldı - manuel temizleme ile yönetilecek

  // Logları temizle - useCallback ile tanımla
  const clearLogs = useCallback(() => {
    // Otomatik temizleme ile aynı mantığı kullan
    console.log('[LogContext] Manuel temizleme yapılıyor');
    
    // Direkt olarak client tarafında temizle
    setLogs([]);
    
    // Server'a aynı şekilde bildir (otomatik temizleme gibi)
    if (socket) {
      setTimeout(() => {
        socket.emit('logs:clear');
      }, 100);
    }
  }, [socket]); // Socket'i dependency olarak ekle

  useEffect(() => {
    // Mevcut URL'den hostname alalım ve socket.io için kullanacağımız URL'yi oluşturalım
    // Production'da bu URL değiştirilebilir
    const socketURL = `${window.location.protocol}//${window.location.hostname}:3001`;
    
    // Socket.IO bağlantısını başlat
    const newSocket = io(`${socketURL}/logs`, {
      transports: ['websocket', 'polling'],
    });

    setSocket(newSocket);

    // Socket bağlantı eventlerini dinle
    newSocket.on('connect', () => {
      console.log('[LogContext] Socket.IO bağlantısı kuruldu');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('[LogContext] Socket.IO bağlantısı koptu');
      setIsConnected(false);
    });

    // Geçmiş logları al
    newSocket.on('logs:history', (historyLogs: LogMessage[]) => {
      if (!isPaused) {
        setLogs(historyLogs);
        // Otomatik log temizleme kaldırıldı - manuel temizleme ile yönetilecek
      }
    });

    // Yeni log geldiğinde ekle
    newSocket.on('logs:new', (newLog: LogMessage) => {
      if (!isPaused) {
        setLogs(prevLogs => [...prevLogs, newLog]);
        // Otomatik log temizleme kaldırıldı - manuel temizleme ile yönetilecek
      }
    });

    // Loglar temizlendiğinde
    newSocket.on('logs:cleared', () => {
      // Her durumda temizle (pause durumunda da)
      setLogs([]);
    });

    // Komponent unmount olduğunda bağlantıyı kapat
    return () => {
      newSocket.disconnect();
    };
  }, [isPaused]); // Sadece isPaused'u dependency olarak ekleyelim

  // Logları yenile (sunucudan tekrar iste)
  const refreshLogs = () => {
    if (socket) {
      socket.emit('logs:request');
    }
  };

  // Logları Excel (XLS) formatında export et
  const exportLogs = async () => {
    try {
      // Her zaman filtrelenmemiş tüm logları kullan, filtrelemeyi göz ardı et
      const exportData = logs;
      
      // Excel workbook ve sheet oluştur
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('System Logs');
      
      // Tablo için başlıklar ve filtreleme oluştur
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: exportData.length + 1, column: 5 }
      };
      
      // Başlıklar ve sütun stilleri
      worksheet.columns = [
        { header: 'Time', key: 'time', width: 20 },
        { header: 'Level', key: 'level', width: 10 },
        { header: 'Source', key: 'source', width: 20 },
        { header: 'Message', key: 'message', width: 60 },
        { header: 'Details', key: 'details', width: 30 }
      ];
      
      // Başlık satırını kalın yap
      worksheet.getRow(1).font = { bold: true };
      
      // Verileri ekle
      exportData.forEach(log => {
        worksheet.addRow({
          time: new Date(log.timestamp).toLocaleString(),
          level: log.level,
          source: log.source,
          message: log.message,
          details: log.details ? JSON.stringify(log.details) : ''
        });
      });
      
      // İçeriğe göre sütun genişliklerini ayarla
      worksheet.columns.forEach(column => {
        if (column && typeof column === 'object') {
          let maxLength = 0;
          column.eachCell?.({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
              maxLength = columnLength;
            }
          });
          if (typeof column.width !== 'undefined') {
            column.width = Math.min(maxLength + 2, 100); // Max 100 karakterle sınırla
          }
        }
      });
      
      // Excel dosyasını oluştur ve indir
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `system_logs_${new Date().toISOString().replace(/:/g, '-')}.xlsx`);
      
      console.log('[LogContext] Excel dosyası başarıyla oluşturuldu');
    } catch (error) {
      console.error('[LogContext] Excel oluşturma hatası:', error);
      alert('Excel dosyası oluşturulurken bir hata oluştu!');
    }
  };

  // Logları filtrele
  const filterLogs = (filters: LogFilter): LogMessage[] => {
    let filtered = [...logs];
    
    if (filters.level && filters.level !== 'ALL') {
      filtered = filtered.filter(log => log.level === filters.level);
    }
    
    if (filters.source) {
      filtered = filtered.filter(log => log.source.toLowerCase().includes(filters.source!.toLowerCase()));
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm) || 
        log.source.toLowerCase().includes(searchTerm) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm))
      );
    }
    
    setFilteredLogs(filtered);
    return filtered;
  };

  // Duraklat/Devam et
  const setPaused = (paused: boolean) => {
    setIsPaused(paused);
    
    // Duraklatma kaldırıldığında, logları yenile
    if (!paused && socket) {
      socket.emit('logs:request');
    }
  };

  // Auto-scroll ayarı
  const setAutoScroll = (autoScroll: boolean) => {
    setIsAutoScroll(autoScroll);
  };

  return (
    <LogContext.Provider
      value={{
        logs,
        isConnected,
        isPaused,
        isAutoScroll,
        setPaused,
        setAutoScroll,
        clearLogs,
        filterLogs,
        refreshLogs,
        exportLogs
      }}
    >
      {children}
    </LogContext.Provider>
  );
};

export const useLogContext = (): LogContextType => {
  const context = useContext(LogContext);
  if (context === undefined) {
    throw new Error('useLogContext must be used within a LogProvider');
  }
  return context;
};
