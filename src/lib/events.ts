// Uygulama genelinde kullanılacak olay yayınlama sistemi

type EventCallback = (...args: any[]) => void;

class EventEmitter {
  private events: Record<string, EventCallback[]> = {};

  // Bir olaya abone ol
  on(event: string, callback: EventCallback): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  // Bir olaydan aboneliği kaldır
  off(event: string, callback: EventCallback): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  // Bir olay yayınla
  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback(...args));
  }
}

// Uygulama genelinde kullanılacak tek bir örnek oluştur
export const eventEmitter = new EventEmitter();

// Olay türleri
export const EVENTS = {
  // İkon güncellemeleri
  ICON_UPDATED: 'icon_updated',
  BUILDING_UPDATED: 'building_updated',
  FLOOR_UPDATED: 'floor_updated',
  ROOM_UPDATED: 'room_updated',
  
  // Bina işlemleri
  BUILDING_ADDED: 'building_added',
  BUILDING_RENAMED: 'building_renamed',
  BUILDING_DELETED: 'building_deleted',
  
  // Kat işlemleri
  FLOOR_ADDED: 'floor_added',
  FLOOR_RENAMED: 'floor_renamed',
  FLOOR_DELETED: 'floor_deleted',
  
  // Oda işlemleri
  ROOM_ADDED: 'room_added',
  ROOM_RENAMED: 'room_renamed',
  ROOM_DELETED: 'room_deleted',
};
