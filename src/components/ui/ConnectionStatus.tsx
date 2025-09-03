'use client';

import React, { useState, useEffect } from 'react';
import { useWebSocket } from "@/context/WebSocketContext";
import { RefreshCcw, Wifi, WifiOff } from 'lucide-react';

interface ConnectionStatusProps {
  className?: string;
  showLabel?: boolean;
}

const ConnectionStatus = ({
  className = "",
  showLabel = true,
}: ConnectionStatusProps) => {
  const { 
    connectionState, 
  } = useWebSocket();
  
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  
  useEffect(() => {
   
    
    // Bağlantı kurulursa retry sayacını 3 saniye sonra gizle
    if (isConnected) {
      const timer = setTimeout(() => {}, 3000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  // Bağlantı durumuna göre renk ve durum metni belirleme
  const getStatusColor = () => {
    if (isConnected) return "bg-success-500";
    if (isConnecting) return "bg-warning-500";
    return "bg-error-500";
  };

  const getStatusText = () => {
    if (isConnected) return "Connected";
    if (isConnecting) {
      return "Connecting...";
    }
    return "Disconnected";
  };
  
  const getStatusIcon = () => {
    if (isConnected) return <Wifi size={16} className="text-success-500" />;
    if (isConnecting) return <RefreshCcw size={16} className="text-warning-500 animate-spin" />;
    return <WifiOff size={16} className="text-error-500" />;
  };

  return (
    <div 
      className={`flex items-center gap-2 bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow transition-all cursor-pointer hover:bg-white/90`}
    >
      <div className="flex items-center gap-2 w-full justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${getStatusColor()}`}
            title={getStatusText()}
          />
          <span className="text-xs font-medium">{getStatusText()}</span>
        </div>
        {getStatusIcon()}
      </div>
      
      {!isConnected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="mt-2 w-full text-xs bg-primary-500 hover:bg-primary-600 text-white py-1 px-2 rounded-md flex items-center justify-center gap-1"
        >
          <RefreshCcw size={12} />
          Reconnect
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus;
