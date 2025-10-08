import { cloudBridgeAgent } from './cloud-bridge-agent';
import { getServerSocket } from './socket-io-server';
import { backendLogger } from './logger/BackendLogger';

/**
 * Sets up real-time cloud bridge status updates via WebSocket
 */
// Son yayınlanan durum değerini saklamak için
let lastEmittedStatus: string | null = null;

export function setupCloudBridgeEvents(): void {
  // Mevcut bağlantı durumunu hemen al ve yayınla
  const initialStatus = cloudBridgeAgent.getConnectionStatus();
  const io = getServerSocket();
  
  if (io) {
    // İlk başlangıç durumunu yayınla
    io.emit('cloud-bridge-status', { status: initialStatus });
    lastEmittedStatus = initialStatus;
    backendLogger.info(`Emitted initial cloud bridge status: ${initialStatus}`, 'CloudBridgeEvents');
  }
  
  // Add a listener to the cloud bridge agent that will emit status changes to clients
  cloudBridgeAgent.addStatusChangeListener((status) => {
    // Sadece durum değişikliği varsa yayınla (önceki durumdan farklıysa)
    if (status !== lastEmittedStatus) {
      const io = getServerSocket();
      if (io) {
        // Emit the status change to all connected WebSocket clients
        io.emit('cloud-bridge-status', { status });
        lastEmittedStatus = status;
        backendLogger.info(`Emitted cloud bridge status change: ${status}`, 'CloudBridgeEvents');
      }
    }
  });
  
  // Periyodik durum kontrolü - sadece 30 saniyede bir ve değişiklik varsa yayınla
  setInterval(() => {
    const currentStatus = cloudBridgeAgent.getConnectionStatus();
    // Sadece farklı bir durum varsa yayınla
    if (currentStatus !== lastEmittedStatus) {
      const io = getServerSocket();
      if (io) {
        io.emit('cloud-bridge-status', { status: currentStatus });
        lastEmittedStatus = currentStatus;
        backendLogger.info(`Emitted periodic cloud bridge status update: ${currentStatus}`, 'CloudBridgeEvents');
      }
    }
  }, 30000); // Daha uzun aralık - 30 saniye

  backendLogger.info('Cloud Bridge events setup complete', 'CloudBridgeEvents');
}