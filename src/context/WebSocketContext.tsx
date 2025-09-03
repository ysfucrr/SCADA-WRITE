'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { showToast } from '@/components/ui/alert';

// This is a global wrapper to store the socket instance.
// This prevents the socket from being re-created on component re-mount.
let socketInstance: Socket | null = null;

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface WebSocketContextType {
  socket: Socket | null;
  connectionState: ConnectionState;
  watchRegister: (register: {
    analyzerId: string | number;
    address: number;
    dataType: string;
    scale?: number;
    byteOrder?: string;
    bit?: number;
    registerId?: string;
  }, callback: (value: any) => void) => void;
  unwatchRegister: (register: {
    analyzerId: string | number;
    address: number;
    dataType: string;
    bit?: number;
  }, callback: (value: any) => void) => void;
  writeRegister: (data: {
    analyzerId: string | number;
    address: number;
    value: number | string | boolean;
    dataType?: string;
    byteOrder?: string;
    bit?: number;
  }) => Promise<void>;
  writeMultipleRegisters: (data: {
    analyzerId: string | number;
    address: number;
    values: (number | string)[];
  }) => Promise<void>;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  connectionState: 'disconnected',
  watchRegister: () => {},
  unwatchRegister: () => {},
  writeRegister: async () => {},
  writeMultipleRegisters: async () => {},
  isConnected: false,
});

// Defined outside the component scope to preserve listeners on re-mount
const listenerMap = new Map();

// Register değerlerini cache'lemek için localStorage kullan
const REGISTER_CACHE_KEY = 'register_values_cache';

// Cache'den değer oku
const getCachedValue = (key: string): any => {
  try {
    const cache = JSON.parse(localStorage.getItem(REGISTER_CACHE_KEY) || '{}');
    return cache[key];
  } catch {
    return null;
  }
};

// Cache'e değer yaz
const setCachedValue = (key: string, value: any): void => {
  try {
    const cache = JSON.parse(localStorage.getItem(REGISTER_CACHE_KEY) || '{}');
    cache[key] = value;
    localStorage.setItem(REGISTER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage hatası durumunda sessizce geç
  }
};

const ensureSocket = (setConnectionState: React.Dispatch<React.SetStateAction<ConnectionState>>, setIsConnected: React.Dispatch<React.SetStateAction<boolean>>) => {
  if (socketInstance) {
    return socketInstance;
  }
  
  const socketURL = `${window.location.protocol}//${window.location.hostname}:3001`;
  console.log(`[SocketIO] Creating new socket connection to: ${socketURL}`);
  
  socketInstance = io(socketURL, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 5000,
    timeout: 20000,
    path: '/socket.io/',
    withCredentials: true,
    // Removed forceNew: true. 
    // This was causing many issues by forcing a new connection on every render.
  });

  socketInstance.on('connect', () => {
    console.log('[SocketIO] Connected');
    setIsConnected(true);
    setConnectionState('connected');
    
    // On reconnect, re-sync all active subscriptions with the server.
    console.log('[SocketIO] Re-syncing subscriptions...');
    for (const [key, data] of listenerMap.entries()) {
      if (data.callbacks.length > 0) {
        console.log(`[SocketIO] Resubscribing to: ${key}`);
        socketInstance?.emit('watch-register', data.register);
      }
    }
  });

  socketInstance.on('disconnect', (reason) => {
    console.warn(`[SocketIO] Disconnected: ${reason}`);
    setIsConnected(false);
    setConnectionState('disconnected');
  });

  socketInstance.on('connect_error', (err) => {
    console.error('[SocketIO] Connection Error:', err.message);
    setIsConnected(false);
    setConnectionState('disconnected');
  });
  
  socketInstance.on('register-value', (data) => {
    const key = data.dataType === 'boolean' && typeof data.bit === 'number'
      ? `${data.analyzerId}-${data.address}-bit${data.bit}`
      : `${data.analyzerId}-${data.address}`;
      
    // Değeri cache'le
    setCachedValue(key, data.value);
      
    const listeners = listenerMap.get(key);
    if (listeners && listeners.callbacks) {
      listeners.callbacks.forEach((callback: (value: any) => void) => {
        callback(data.value);
      });
    }
  });

  return socketInstance;
};

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    const s = ensureSocket(setConnectionState, setIsConnected);
    setSocket(s);
    setConnectionState(s.connected ? 'connected' : 'connecting');
    setIsConnected(s.connected);

    return () => {
      // Do not disconnect the socket on unmount.
      // Keeping it alive preserves the state when navigating between pages.
      console.log('[SocketIO] WebSocketProvider unmounted, but connection is kept alive.');
    };
  }, []);

  const watchRegister = useCallback((register: any, callback: (value: any) => void) => {
    if (!socketInstance) return;

    const key = register.dataType === 'boolean' && typeof register.bit === 'number'
      ? `${register.analyzerId}-${register.address}-bit${register.bit}`
      : `${register.analyzerId}-${register.address}`;

    // Cache'den son değeri al ve hemen callback'e gönder
    const cachedValue = getCachedValue(key);
    if (cachedValue !== null && cachedValue !== undefined) {
      callback(cachedValue);
    }

    const listeners = listenerMap.get(key);

    if (listeners) {
      // Avoid adding the same callback twice
      if (!listeners.callbacks.includes(callback)) {
        listeners.callbacks.push(callback);
      }
    } else {
      // First subscription for this register
      listenerMap.set(key, { register, callbacks: [callback] });
      if (socketInstance.connected) {
        //console.log(`[SocketIO] Sending new watch request for: ${key}`);
        socketInstance.emit('watch-register', register);
      }
    }
  }, []);

  const unwatchRegister = useCallback((register: any, callback: (value: any) => void) => {
    if (!socketInstance) return;

    const key = register.dataType === 'boolean' && typeof register.bit === 'number'
      ? `${register.analyzerId}-${register.address}-bit${register.bit}`
      : `${register.analyzerId}-${register.address}`;

    const listeners = listenerMap.get(key);

    if (listeners) {
      listeners.callbacks = listeners.callbacks.filter((cb: any) => cb !== callback);

      if (listeners.callbacks.length === 0) {
        // No more listeners for this register
        listenerMap.delete(key);
        if (socketInstance.connected) {
          console.log(`[SocketIO] Sending unwatch request for: ${key}`);
          socketInstance.emit('unwatch-register', register);
        }
      }
    }
  }, []);

  const writeRegister = useCallback(async (data: {
    analyzerId: string | number;
    address: number;
    value: number | string | boolean;
    dataType?: string;
    byteOrder?: string;
    bit?: number;
  }) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketInstance || !socketInstance.connected) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `write_${Date.now()}_${Math.random()}`;
      const timeout = setTimeout(() => {
        if (socketInstance) {
          socketInstance.off('write-success');
          socketInstance.off('write-error');
        }
        reject(new Error('Write operation timeout'));
      }, 10000);

      const successHandler = (response: any) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          if (socketInstance) {
            socketInstance.off('write-success', successHandler);
            socketInstance.off('write-error', errorHandler);
          }
          resolve();
        }
      };

      const errorHandler = (response: any) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          if (socketInstance) {
            socketInstance.off('write-success', successHandler);
            socketInstance.off('write-error', errorHandler);
          }
          reject(new Error(response.error || 'Write operation failed'));
        }
      };

      socketInstance.on('write-success', successHandler);
      socketInstance.on('write-error', errorHandler);

      socketInstance.emit('write-register', { ...data, requestId });
    });
  }, []);

  const writeMultipleRegisters = useCallback(async (data: {
    analyzerId: string | number;
    address: number;
    values: (number | string)[];
  }) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketInstance || !socketInstance.connected) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `write_multiple_${Date.now()}_${Math.random()}`;
      const timeout = setTimeout(() => {
        if (socketInstance) {
          socketInstance.off('write-multiple-success');
          socketInstance.off('write-multiple-error');
        }
        reject(new Error('Write multiple operation timeout'));
      }, 15000);

      const successHandler = (response: any) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          if (socketInstance) {
            socketInstance.off('write-multiple-success', successHandler);
            socketInstance.off('write-multiple-error', errorHandler);
          }
          resolve();
        }
      };

      const errorHandler = (response: any) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          if (socketInstance) {
            socketInstance.off('write-multiple-success', successHandler);
            socketInstance.off('write-multiple-error', errorHandler);
          }
          reject(new Error(response.error || 'Write multiple operation failed'));
        }
      };

      socketInstance.on('write-multiple-success', successHandler);
      socketInstance.on('write-multiple-error', errorHandler);

      socketInstance.emit('write-multiple-registers', { ...data, requestId });
    });
  }, []);
  
  return (
    <WebSocketContext.Provider
      value={{
        socket,
        connectionState,
        watchRegister,
        unwatchRegister,
        writeRegister,
        writeMultipleRegisters,
        isConnected,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
