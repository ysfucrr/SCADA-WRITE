import { NextResponse } from 'next/server';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';

const execPromise = promisify(exec);

// Windows için COM portlarını tespit eden fonksiyon
async function getWindowsComPorts(): Promise<string[]> {
  try {
    // Windows'ta 'mode' komutunu kullanarak mevcut COM portlarını listele
    const { stdout } = await execPromise('mode');
    
    // Stdout'dan COM portlarını çıkar (COM1, COM2, vs.)
    const comPortRegex = /COM\d+/g;
    const comPorts = stdout.match(comPortRegex) || [];
    
    // Tekrar eden portları kaldır
    return [...new Set(comPorts)];
  } catch (error) {
    backendLogger.error(`Error detecting COM ports using mode command: ${(error as Error).message}`, "SerialPortsAPI");
    return [];
  }
}

// Linux/Ubuntu için seri portları tespit eden fonksiyon
async function getLinuxSerialPorts(): Promise<string[]> {
  try {
    // Linux'ta önce /dev/ttyS* ve /dev/ttyUSB* cihazlarını listele
    const commands = [
      'ls -1 /dev/ttyS* 2>/dev/null || true',
      'ls -1 /dev/ttyUSB* 2>/dev/null || true',
      'ls -1 /dev/ttyACM* 2>/dev/null || true',
      'ls -1 /dev/ttyAMA* 2>/dev/null || true'
    ];
    
    const ports: string[] = [];
    
    // Her bir komutu çalıştır ve sonuçları birleştir
    for (const cmd of commands) {
      try {
        const { stdout } = await execPromise(cmd);
        if (stdout.trim()) {
          // Her satırı bir port olarak ekle
          const cmdPorts = stdout.trim().split('\n');
          ports.push(...cmdPorts);
        }
      } catch {
        // Komutu çalıştırırken hata alınırsa sonraki komuta geç
        continue;
      }
    }
    
    // Daha fazla bilgi için by-id ve by-path listelemeyi dene
    try {
      const { stdout: byIdStdout } = await execPromise('ls -1 /dev/serial/by-id/* 2>/dev/null || true');
      if (byIdStdout.trim()) {
        // Bu genellikle sembolik bağlantılar içerir, doğrudan eklemiyoruz
        backendLogger.info(`Found additional serial devices by-id: ${byIdStdout.trim().split('\n').length}`, "SerialPortsAPI");
      }
    } catch {
      // İsteğe bağlı olduğu için hataları yok say
    }
    
    return ports;
  } catch (error) {
    backendLogger.error(`Error detecting serial ports on Linux: ${(error as Error).message}`, "SerialPortsAPI");
    return [];
  }
}

// İşletim sistemine göre port tespiti yapan API
export async function GET() {
  try {
    const currentOS = platform();
    let serialPorts: string[] = [];
    let source = "unknown";
    
    // İşletim sistemine göre uygun port tespit fonksiyonunu çağır
    if (currentOS === 'win32') {
      serialPorts = await getWindowsComPorts();
      source = "Windows mode command";
    } else if (currentOS === 'linux' || currentOS === 'darwin') {
      serialPorts = await getLinuxSerialPorts();
      source = currentOS === 'linux' ? "Linux device listing" : "macOS device listing";
    } else {
      backendLogger.warning(`Unsupported OS for serial port detection: ${currentOS}`, "SerialPortsAPI");
    }
    
    backendLogger.info(`${serialPorts.length} serial ports found using ${source}`, "SerialPortsAPI");
    
    // Standart port bilgisi formatı
    return NextResponse.json({
      ports: serialPorts.map(portPath => ({
        path: portPath,
        manufacturer: currentOS === 'win32' ? "Windows Device" :
                      currentOS === 'linux' ? "Linux Device" :
                      currentOS === 'darwin' ? "macOS Device" : "Unknown Device",
        serialNumber: null,
        pnpId: null,
        vendorId: null,
        productId: null
      })),
      platform: currentOS
    });
  } catch (error) {
    backendLogger.error(`Error listing serial ports: ${(error as Error).message}`, "SerialPortsAPI");
    
    // Hata durumunda boş liste döndür, ancak hata mesajını da ekle
    return NextResponse.json({
      ports: [],
      error: (error as Error).message,
      platform: platform()
    });
  }
}