"use client";
import React, { useState, useEffect } from "react";
import { Typography } from "@/components/ui/typography";
import { showToast, showErrorAlert, showSuccessAlert, showConfirmAlert } from "@/components/ui/alert";
import axios from "axios";
import io from "socket.io-client";
import { useWebSocket } from "@/context/WebSocketContext";

interface CloudSettings {
  serverIp: string;
  httpPort: number;
  wsPort: number;
}

// Bağlantı durumu tipi
type ConnectionStatus = 'none' | 'connected' | 'error' | 'connecting';

const CloudSettingsPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('none');
  // Son durum değişiklik zamanını tutarak hızlı durum değişimlerini engelle
  const [lastStatusChangeTime, setLastStatusChangeTime] = useState<number>(0);
  const [settings, setSettings] = useState<CloudSettings>({
    serverIp: "",
    httpPort: 4000,
    wsPort: 4000, // Not: Cloud Bridge Server genellikle Socket.IO için de aynı portu kullanır
  });
  
  // Get Socket.IO connection for real-time updates
  const { socket, isConnected: socketConnected } = useWebSocket();

  // Load existing settings and initial connection status
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        
        // Fetch cloud settings
        const settingsResponse = await axios.get("/api/cloud-settings");
        if (settingsResponse.data.success && settingsResponse.data.settings) {
          setSettings(settingsResponse.data.settings);
        }
        
        // Sayfa ilk açıldığında "Test Connection" yap - gerçek durumu görmek için
        // Bu şekilde sayfa açılırken doğru durumu görebiliriz
        try {
          // Bağlantı testi yap
          const testResponse = await axios.post("/api/cloud-settings/test", settingsResponse.data.settings);
          console.log("Auto initial connection test:", testResponse.data);
          
          if (testResponse.data.httpSuccess) {
            updateConnectionStatus('connected');
          } else {
            updateConnectionStatus('error');
          }
        } catch (testError) {
          console.error("Error during initial connection test:", testError);
          updateConnectionStatus('error');
        }
      } catch (error) {
        console.error("Error fetching cloud settings:", error);
        showErrorAlert(
          "Error",
          "Failed to load cloud settings"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
    
    // Sayfa her açıldığında sadece belirli aralıklarla durumu test et
    // API çağrımı doğrudan test yaparak "Test Connection" yapsın
    const checkInterval = setInterval(async () => {
      try {
        console.log("Performing periodic connection test");
        
        // Bağlantı testi yap
        const testResponse = await axios.post("/api/cloud-settings/test", settings);
        
        if (testResponse.data.httpSuccess) {
          updateConnectionStatus('connected');
        } else {
          updateConnectionStatus('error');
        }
      } catch (error) {
        console.error("Error performing periodic connection test:", error);
      }
    }, 60000); // 1 dakikada bir doğrudan test yap
    
    return () => {
      clearInterval(checkInterval);
    };
  }, []);
  
  // Durum güncellemelerini stabilize eden fonksiyon
  const updateConnectionStatus = (newStatus: ConnectionStatus) => {
    const now = Date.now();
    const minTimeBetweenUpdates = 5000; // 5 saniye
    
    // Önceki durum değişikliğinden yeterli süre geçtiyse veya
    // önemli bir durum değişikliği varsa (none -> connected gibi) güncelle
    if (
      now - lastStatusChangeTime >= minTimeBetweenUpdates ||
      connectionStatus === 'none' ||
      newStatus === 'connecting' ||
      (connectionStatus === 'error' && newStatus === 'connected') ||
      (connectionStatus === 'connected' && newStatus === 'error')
    ) {
      console.log(`Updating connection status from ${connectionStatus} to ${newStatus}`);
      setConnectionStatus(newStatus);
      setLastStatusChangeTime(now);
    } else {
      console.log(`Ignoring rapid status change: ${newStatus} (current: ${connectionStatus}, time since last: ${now - lastStatusChangeTime}ms)`);
    }
  };

  // Subscribe to real-time cloud bridge status updates
  useEffect(() => {
    if (!socket) return;
    
    console.log("Socket.IO connection available, subscribing to cloud bridge status events");
    
    // Listen for cloud-bridge-status events
    const handleStatusUpdate = (data: { status: 'disconnected' | 'connected' | 'connecting' }) => {
      console.log('Received cloud bridge status update via Socket.IO:', data);
      
      if (data.status === 'connected') {
        updateConnectionStatus('connected');
      } else if (data.status === 'connecting') {
        updateConnectionStatus('connecting');
      } else {
        updateConnectionStatus('error');
      }
    };
    
    // Bağlantı durumunu sorgulama için özel bir istek mekanizması
    const requestStatusUpdate = () => {
      if (socket.connected) {
        socket.emit('request-cloud-bridge-status');
        console.log("Requesting cloud bridge status update via Socket.IO");
      }
    };
    
    // Hemen bir durum güncellemesi iste
    requestStatusUpdate();
    
    // Socket.IO bağlantı durumu değişim olaylarını dinle
    socket.on('connect', () => {
      console.log("Socket.IO connected, requesting status update");
      // Socket.IO bağlandığında durumu sorgula
      setTimeout(() => {
        requestStatusUpdate();
      }, 1000); // Bağlantı kurulduktan 1 saniye sonra sorgula
    });
    
    socket.on('disconnect', () => {
      console.log("Socket.IO disconnected");
      // Socket.IO bağlantısı kesildiğinde durumu etkileme
      // Bu durum SCADA servisi çalışıyor ama Socket.IO bağlantısı kopmuş olabilir
      // Sadece loglama yap ama durumu değiştirme
    });
    
    // Cloud Bridge status olaylarını dinle
    socket.on('cloud-bridge-status', handleStatusUpdate);
    
    // Socket.IO bağlantısı kurulduğunda hemen status iste
    if (socketConnected) {
      console.log("Socket.IO already connected on page load, requesting status immediately");
      requestStatusUpdate();
    }
    
    // Periyodik olarak durum güncellemesi iste (Socket.IO bağlantısı aktif olduğundan emin olmak için)
    const statusInterval = setInterval(requestStatusUpdate, 30000);
    
    // Cleanup listener when component unmounts
    return () => {
      socket.off('cloud-bridge-status', handleStatusUpdate);
      socket.off('connect');
      socket.off('disconnect');
      clearInterval(statusInterval);
    };
  }, [socket]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Convert port values to numbers
    if (name === "httpPort" || name === "wsPort") {
      const numValue = parseInt(value);
      setSettings({
        ...settings,
        [name]: isNaN(numValue) ? 0 : numValue,
      });
    } else {
      setSettings({
        ...settings,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate settings
    if (!settings.serverIp) {
      showErrorAlert(
        "Validation Error",
        "Server IP is required"
      );
      return;
    }

    if (!settings.httpPort || settings.httpPort < 1 || settings.httpPort > 65535) {
      showErrorAlert(
        "Validation Error",
        "HTTP Port must be between 1 and 65535"
      );
      return;
    }

    if (!settings.wsPort || settings.wsPort < 1 || settings.wsPort > 65535) {
      showErrorAlert(
        "Validation Error",
        "WebSocket Port must be between 1 and 65535"
      );
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post("/api/cloud-settings", settings);
      
      if (response.data.success) {
        showSuccessAlert(
          "Success",
          "Cloud settings saved successfully"
        );
      } else {
        showErrorAlert(
          "Error",
          response.data.message || "Failed to save settings"
        );
      }
    } catch (error) {
      console.error("Error saving cloud settings:", error);
      showErrorAlert(
        "Error",
        "Failed to save cloud settings"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const testHttpConnection = async () => {
    try {
      setIsTesting(true);
      setConnectionStatus('none'); // Testi başlatırken durumu sıfırla
      
      const response = await axios.post("/api/cloud-settings/test", settings);
      
      if (response.data.httpSuccess) {
        showSuccessAlert(
          "Success",
          "HTTP connection successful"
        );
        // HTTP bağlantısı başarılı, ama tam durumu WebSocket testi sonrası belirleyeceğiz
        return response.data.httpSuccess;
      } else {
        showErrorAlert(
          "Error",
          "HTTP connection failed. Check your settings and ensure the cloud bridge is running."
        );
        setConnectionStatus('error'); // HTTP bağlantısı başarısız
        return false;
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      showErrorAlert(
        "Error",
        "Failed to test connection"
      );
      setConnectionStatus('error'); // Hata durumunda bağlantı başarısız
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  const testWsConnection = () => {
    try {
      // ÖNEMLİ: Cloud Bridge Server, Socket.IO servisini HTTP portu üzerinde çalıştırıyor
      // Bu yüzden WebSocket port değil, HTTP port kullanılmalı
      const socketUrl = `http://${settings.serverIp}:${settings.httpPort}`;
      console.log(`Testing Socket.IO connection to: ${socketUrl}`);
      
      // Socket.IO bağlantısı oluştur (WebSocket yerine Socket.IO kullanıyoruz)
      // Socket.IO bağlantı parametrelerini ince ayarla
      console.log('Attempting Socket.IO connection with enhanced parameters');
      
      const socket = io(socketUrl, {
        transports: ['polling', 'websocket'], // Önce polling, sonra websocket
        reconnection: true,                   // Otomatik yeniden bağlanmayı etkinleştir
        reconnectionAttempts: 2,             // En fazla 2 yeniden bağlanma denemesi yap
        reconnectionDelay: 1000,             // İlk yeniden bağlanma denemesi için 1 saniye bekle
        timeout: 15000,                       // 15 saniye timeout
        path: '/socket.io/',                  // Default Socket.IO path
        query: { type: 'test-client' }        // Bağlantı tipi bilgisi
      });
      
      console.log('Socket.IO connection object created, waiting for events...');
      
      // 10 saniye içinde bağlantı başarılı olmazsa timeout
      const connectionTimeout = setTimeout(() => {
        if (socket.connected === false) {
          console.log('Socket.IO connection timeout occurred');
          socket.close();
          showErrorAlert(
            "Error",
            "Socket.IO connection failed: timeout. Check your settings and ensure the cloud bridge server is running. HTTP port and Socket.IO port should typically be the same (4000)."
          );
          setConnectionStatus('error'); // Zaman aşımında bağlantı başarısız
        }
      }, 15000);
      
      socket.on('connect', () => {
        console.log('Socket.IO CONNECTED successfully!');
        clearTimeout(connectionTimeout);
        showSuccessAlert(
          "Success",
          "Socket.IO connection successful"
        );
        setConnectionStatus('connected'); // WebSocket bağlantısı başarılı
        
        // Bağlantı başarılı olduğunda identify et ve kapat
        socket.emit('identify', {
          type: 'test-client',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          message: 'Testing connection from SCADA UI'
        });
        
        // Ping-Pong testi yap
        // Ping mesajını debug bilgisiyle gönder
        console.log('Sending ping message...');
        socket.emit('ping', () => {
          console.log('Received pong response from server!');
        });
        
        // 2 saniye sonra bağlantıyı kapat (daha uzun süre tanıyalım)
        setTimeout(() => {
          socket.disconnect();
        }, 3000);
      });
      
      socket.on('connect_error', (error) => {
        clearTimeout(connectionTimeout);
        console.error("Socket.IO connection error:", error);
        showErrorAlert(
          "Error",
          `Socket.IO connection failed: ${error.message}. Check your settings and ensure the cloud bridge is running on port ${settings.httpPort}.`
        );
        setConnectionStatus('error'); // Bağlantı hatası
        socket.close();
      });
      
    } catch (error) {
      console.error("Socket.IO setup error:", error);
      showErrorAlert(
        "Error",
        "Failed to establish Socket.IO connection"
      );
      setConnectionStatus('error'); // Genel hata durumunda bağlantı başarısız
    }
  };

  const handleTestConnection = async () => {
    // First test HTTP connection
    const httpSuccess = await testHttpConnection();
    
    // If HTTP successful, test WebSocket connection
    if (httpSuccess) {
      testWsConnection();
    }
  };
  
  // Cloud Settings veritabanı kaydını silme fonksiyonu
  const handleDeleteSettings = async () => {
    try {
      // Özel onay modalı ile silme onayı al
      const result = await showConfirmAlert(
        "Delete Cloud Settings?",
        "Are you sure you want to delete all cloud bridge settings?",
        "Yes",
        "Cancel"
      );
      
      // Kullanıcı onaylamadıysa işlemi durdur
      if (!result.isConfirmed) return;
      
      setIsLoading(true);
      
      // API endpoint'ine istek gönder
      const response = await axios.post("/api/cloud-settings/delete");
      
      if (response.data.success) {
        // Ayarları varsayılana sıfırla
        setSettings({
          serverIp: "",
          httpPort: 4000,
          wsPort: 4000
        });
        
        // Bağlantı durumunu sıfırla
        setConnectionStatus('none');
        
        showSuccessAlert(
          "Success",
          "Cloud settings deleted successfully"
        );
      } else {
        showErrorAlert(
          "Error",
          response.data.message || "Failed to delete settings"
        );
      }
    } catch (error) {
      console.error("Error deleting cloud settings:", error);
      showErrorAlert(
        "Error",
        "Failed to delete cloud settings"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Bağlantı durumu ikonunu render et
  const renderConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <div className="inline-flex items-center px-4 py-2 bg-green-50 rounded-full dark:bg-green-900/30">
            <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2 shadow-sm shadow-green-500/50"></span>
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">Connected</span>
          </div>
        );
      case 'error':
        return (
          <div className="inline-flex items-center px-4 py-2 bg-red-50 rounded-full dark:bg-red-900/30">
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-2 shadow-sm shadow-red-500/50"></span>
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Connection Failed</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="inline-flex items-center px-4 py-2 bg-yellow-50 rounded-full dark:bg-yellow-900/30">
            <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full mr-2 animate-pulse shadow-sm shadow-yellow-500/50"></span>
            <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Connecting...</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center px-4 py-2 bg-gray-50 rounded-full dark:bg-gray-800">
            <span className="inline-block w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Not Tested</span>
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Blue header section */}
      <div className="bg-blue-500 rounded-t-lg p-6 mb-0 text-white">
        <h2 className="text-xl font-semibold">Configuration</h2>
        <p className="text-sm mt-1 text-blue-100">
          Configure your cloud bridge connection settings
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-b-lg shadow-lg p-6 mb-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Enable Cloud Bridge Toggle */}
          <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Enable Cloud Bridge</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Activate remote access to your SCADA system</p>
              </div>
            </div>
            <div className="h-6 w-12 bg-green-600 rounded-full relative cursor-pointer flex items-center justify-end px-1">
              <div className="h-4 w-4 bg-white rounded-full"></div>
            </div>
          </div>
          {/* Server URL Field */}
          <div className="mb-6">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Cloud Server URL *
            </label>
            <div className="relative max-w-xl">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <input
                type="text"
                id="serverIp"
                name="serverIp"
                value={settings.serverIp}
                onChange={handleInputChange}
                className="pl-10 block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                placeholder="192.168.1.100"
                disabled={isLoading}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Enter the full URL of your cloud bridge server (e.g., http://123.456.789.0:8080)</p>
          </div>

          {/* HTTP Port Field */}
          <div className="mb-6">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
              HTTP Port
            </label>
            <div className="relative max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>
              <input
                type="number"
                id="httpPort"
                name="httpPort"
                value={settings.httpPort}
                onChange={handleInputChange}
                className="pl-10 block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                min="1"
                max="65535"
                placeholder="4000"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Socket.IO Port Field */}
          <div className="mb-6">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Socket.IO Port <span className="text-xs text-gray-500">(Genellikle HTTP port ile aynı)</span>
            </label>
            <div className="relative max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <input
                type="number"
                id="wsPort"
                name="wsPort"
                value={settings.wsPort}
                onChange={handleInputChange}
                className="pl-10 block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                min="1"
                max="65535"
                placeholder="4001"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-start gap-3 pt-4 mt-8">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isLoading || isTesting || !settings.serverIp}
              className="inline-flex items-center px-4 py-2.5 bg-blue-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
              </svg>
              {isTesting ? "Testing..." : "Test Connection"}
            </button>
            
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2.5 bg-blue-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {isLoading ? "Saving..." : "Save Settings"}
            </button>
            
            <button
              type="button"
              onClick={handleDeleteSettings}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2.5 bg-red-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </form>
        {/* Status Card */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg shadow p-4 mb-6">
          <div className="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Cloud Bridge Status</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="font-medium mr-1">Server:</span> {settings.serverIp || "Not configured"}
            </div>
            
            <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium mr-1">Connection Status:</span> {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'error' ? 'Offline' : 'Not Tested'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudSettingsPage;