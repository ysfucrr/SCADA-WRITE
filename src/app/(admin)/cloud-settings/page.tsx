"use client";
import React, { useState, useEffect } from "react";
import { showToast, showErrorAlert, showSuccessAlert, showConfirmAlert } from "@/components/ui/alert";
import axios from "axios";
import io from "socket.io-client";
import { useWebSocket } from "@/context/WebSocketContext";
import { PlusCircle, Smartphone } from "lucide-react";
import MobileUserCard from "@/components/mobile-users/MobileUserCard";

interface CloudSettings {
  serverIp: string;
  httpPort: number;
  httpsPort: number;
  wsPort: number;
  agentName?: string;
}

interface MobileUser {
  _id: string;
  username: string;
  permissionLevel: 'read' | 'readwrite' | 'admin';
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

// Bağlantı durumu tipi
type ConnectionStatus = 'none' | 'connected' | 'error' | 'connecting';

const CloudSettingsPage = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'server-settings' | 'mobile-users' | 'manage-users'>('server-settings');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('none');
  // Son durum değişiklik zamanını tutarak hızlı durum değişimlerini engelle
  const [lastStatusChangeTime, setLastStatusChangeTime] = useState<number>(0);
  const [settings, setSettings] = useState<CloudSettings>({
    serverIp: "",
    httpPort: 4000, // Eski uyumluluk için tutuldu
    httpsPort: 443, // Sabit HTTPS portu
    wsPort: 4000, // Eski uyumluluk için tutuldu
    agentName: "", // SCADA agent name for identification
  });
  
  // Mobile Users states
  const [mobileUsers, setMobileUsers] = useState<MobileUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState<{ username: string; password: string; permissionLevel: 'read' | 'readwrite' | 'admin' }>({
    username: '',
    password: '',
    permissionLevel: 'read'
  });
  const [selectedUser, setSelectedUser] = useState<MobileUser | null>(null);
  const [editMode, setEditMode] = useState(false);
  
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
          
          // Sadece server IP ayarı varsa bağlantı testi yap
          if (settingsResponse.data.settings.serverIp) {
            console.log("Server IP configuration exists, testing initial connection");
            
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
          } else {
            console.log("No server IP configured, skipping connection test");
            updateConnectionStatus('none');
          }
        } else {
          // Ayarlar yoksa bağlantı denemesi yapma
          console.log("No cloud settings found, skipping connection test");
          updateConnectionStatus('none');
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
    
    // Periyodik olarak sadece server IP ayarı varsa bağlantı testi yap
    const checkInterval = setInterval(async () => {
      // Ayarlar yoksa veya Server IP yoksa bağlantı testi yapma
      if (!settings.serverIp) {
        console.log("No server IP configured, skipping periodic test");
        return;
      }
      
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
  
  // Fetch mobile users
  useEffect(() => {
    // Only load users when the manage-users tab is active
    if (activeTab === 'manage-users') {
      fetchMobileUsers();
    }
  }, [activeTab]);
  
  const fetchMobileUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await axios.get('/api/mobile-users');
      
      if (response.data.success) {
        setMobileUsers(response.data.users);
      } else {
        showErrorAlert('Error', 'Failed to load mobile users');
      }
    } catch (error) {
      console.error('Error fetching mobile users:', error);
      showErrorAlert('Error', 'Failed to load mobile users');
    } finally {
      setLoadingUsers(false);
    }
  };
  
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
    setSettings({
      ...settings,
      [name]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate settings
    if (!settings.serverIp) {
      showErrorAlert(
        "Validation Error",
        "Domain address is required"
      );
      return;
    }

    // Domain validation - basit kontrol
    const domainRegex = /^([a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(settings.serverIp)) {
      showErrorAlert(
        "Validation Error",
        "Please enter a valid domain address (e.g., example.com)"
      );
      return;
    }
    
    // Agent name validation
    if (!settings.agentName || settings.agentName.trim() === '') {
      showErrorAlert(
        "Validation Error",
        "Agent name is required"
      );
      return;
    }

    try {
      setIsLoading(true);
      // Domain adresi ve agent adını gönder
      const response = await axios.post("/api/cloud-settings", {
        serverIp: settings.serverIp,
        agentName: settings.agentName
      });
      
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
      
      const response = await axios.post("/api/cloud-settings/test", {
        serverIp: settings.serverIp
      });
      
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
      // Cloud Bridge artık sadece HTTPS üzerinden çalışıyor
      const socketUrl = `https://${settings.serverIp}:443`;
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
            "Socket.IO connection failed: timeout. Check your settings and ensure the cloud bridge server is running on HTTPS port 443."
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
          `Socket.IO connection failed: ${error.message}. Check your settings and ensure the cloud bridge is running on HTTPS port 443.`
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
          httpsPort: 443,
          wsPort: 4000,
          agentName: "" // Bu alan eksikti, undefined oluyordu
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
  
  // Add new mobile user
  const handleAddMobileUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.username || !newUser.password) {
      showErrorAlert('Validation Error', 'Username and password are required');
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await axios.post('/api/mobile-users', newUser);
      
      if (response.data.success) {
        showSuccessAlert('Success', 'Mobile user added successfully');
        setNewUser({ username: '', password: '', permissionLevel: 'read' });
        
        // Refresh user list if on manage-users tab
        if (activeTab === 'manage-users') {
          fetchMobileUsers();
        }
      } else {
        showErrorAlert('Error', response.data.message || 'Failed to add mobile user');
      }
    } catch (error: any) {
      console.error('Error adding mobile user:', error);
      showErrorAlert('Error', error.response?.data?.message || 'Failed to add mobile user');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Delete mobile user
  const handleDeleteUser = async (userId: string) => {
    try {
      // Özel onay modalı ile silme onayı al
      const result = await showConfirmAlert(
        "Delete User?",
        "Are you sure you want to delete this mobile user? This action cannot be undone.",
        "Yes",
        "Cancel"
      );
      
      // Kullanıcı onaylamadıysa işlemi durdur
      if (!result.isConfirmed) return;
      
      setIsLoading(true);
      
      const response = await axios.delete(`/api/mobile-users/${userId}`);
      
      if (response.data.success) {
        showSuccessAlert('Success', 'User deleted successfully');
        fetchMobileUsers();
      } else {
        showErrorAlert('Error', response.data.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      showErrorAlert('Error', 'Failed to delete user');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Update mobile user
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser) return;
    
    try {
      setIsLoading(true);
      
      const updateData: any = {
        username: newUser.username,
        permissionLevel: newUser.permissionLevel
      };
      
      // Only include password if it's provided (for password change)
      if (newUser.password) {
        updateData.password = newUser.password;
      }
      
      const response = await axios.put(`/api/mobile-users/${selectedUser._id}`, updateData);
      
      if (response.data.success) {
        showSuccessAlert('Success', 'User updated successfully');
        setEditMode(false);
        setSelectedUser(null);
        setNewUser({ username: '', password: '', permissionLevel: 'read' });
        fetchMobileUsers();
      } else {
        showErrorAlert('Error', response.data.message || 'Failed to update user');
      }
    } catch (error: any) {
      console.error('Error updating user:', error);
      showErrorAlert('Error', error.response?.data?.message || 'Failed to update user');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleInputChangeForMobileUser = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewUser({
      ...newUser,
      [name]: value
    });
  };
  
  const handleEditUser = (user: MobileUser) => {
    setSelectedUser(user);
    setNewUser({
      username: user.username,
      password: '', // Don't show existing password
      permissionLevel: user.permissionLevel
    });
    setEditMode(true);
  };
  
  const cancelEdit = () => {
    setSelectedUser(null);
    setNewUser({ username: '', password: '', permissionLevel: 'read' });
    setEditMode(false);
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
    <div className="w-full p-6">
      {/* Tab navigation - Like home page */}
      <div className="mb-8 flex justify-between items-center">
        <div className="flex">
          <button
            className={`py-4 px-8 mr-4 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md ${
              activeTab === 'server-settings'
                ? 'bg-blue-600 text-white dark:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('server-settings')}
          >
            Server Settings
          </button>
          <button
            className={`py-4 px-8 mr-4 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md ${
              activeTab === 'mobile-users'
                ? 'bg-blue-600 text-white dark:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('mobile-users')}
          >
            Mobile Users
          </button>
          <button
            className={`py-4 px-8 mr-4 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md ${
              activeTab === 'manage-users'
                ? 'bg-blue-600 text-white dark:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('manage-users')}
          >
            Manage Users
          </button>
        </div>
        
        {/* Status display */}
        <div className="flex items-center">
          {renderConnectionStatusIcon()}
        </div>
      </div>
      
      {/* Content based on active tab */}
      {activeTab === 'server-settings' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
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
              Cloud Server Domain *
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
                placeholder="example.com"
                disabled={isLoading}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Enter your cloud bridge server domain (e.g., bridge.example.com)</p>
          </div>

          {/* Agent Name Field */}
          <div className="mb-6">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Agent Name *
            </label>
            <div className="relative max-w-xl">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <input
                type="text"
                id="agentName"
                name="agentName"
                value={settings.agentName}
                onChange={handleInputChange}
                className="pl-10 block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                placeholder="My SCADA System"
                disabled={isLoading}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Enter a unique name for this SCADA system for identification</p>
          </div>

          {/* HTTPS Port Field - Sadece gösterim için, değiştirilemez */}
          <div className="mb-6">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              HTTPS Port (Fixed)
            </label>
            <div className="relative max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type="number"
                value={443}
                className="pl-10 block w-full border border-gray-300 rounded-lg shadow-sm bg-gray-100 dark:bg-gray-600 py-2.5 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Cloud Bridge uses standard HTTPS port 443 for secure connections</p>
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
              <span className="font-medium mr-1">Domain:</span> {settings.serverIp || "Not configured"}
            </div>
            
            <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium mr-1">Status:</span> {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'error' ? 'Offline' : 'Not Tested'}
            </div>
          </div>
        </div>
      </div>
      ) : activeTab === 'mobile-users' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          {/* Mobile Users Tab Content */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg shadow p-4 mb-6">
            <div className="flex items-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Mobile User Management</h3>
            </div>
            
            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg mb-4">
              <h4 className="font-medium mb-2">Registered Devices</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {mobileUsers.length > 0
                  ? `${mobileUsers.length} mobile users are registered. Go to Manage Users tab to see the list.`
                  : 'No mobile users are currently registered. Use the form below to add a new mobile user.'}
              </p>
            </div>
            
            <form onSubmit={handleAddMobileUser} className="p-4 bg-white dark:bg-gray-700 rounded-lg">
              <h4 className="font-medium mb-4">Add New Mobile User</h4>
              
              <div className="mb-4">
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={newUser.username}
                  onChange={handleInputChangeForMobileUser}
                  className="block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                  placeholder="   johndoe"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  value={newUser.password}
                  onChange={handleInputChangeForMobileUser}
                  className="block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                  placeholder="********"
                  required
                  minLength={6}
                />
                <p className="text-xs text-gray-500 mt-1">Password must be at least 6 characters long</p>
              </div>
              
              <div className="mb-4">
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Permission Level
                </label>
                <select
                  name="permissionLevel"
                  value={newUser.permissionLevel}
                  onChange={handleInputChangeForMobileUser}
                  className="block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2.5 text-gray-900 dark:text-white"
                >
                  <option value="read">Read Only</option>
                  <option value="readwrite">Read & Write</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2.5 bg-blue-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {isLoading ? "Adding..." : "Add User"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="w-full">
          {/* Header and Controls */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center">
              <Smartphone className="h-5 w-5 text-blue-600 mr-2" />
              Mobile Users
            </h2>
            <div className="flex items-center space-x-3">
              <button
                onClick={fetchMobileUsers}
                className="text-sm px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <button
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-blue-600 focus:outline-none"
                onClick={() => {
                  setActiveTab('mobile-users');
                  setNewUser({ username: '', password: '', permissionLevel: 'read' });
                }}
              >
                <PlusCircle size={16} className="mr-2" />
                Add User
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            {loadingUsers ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
              </div>
            ) : mobileUsers.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Smartphone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No mobile users found. Click "Add User" to create one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {mobileUsers.map((user) => (
                  <MobileUserCard
                    key={user._id}
                    user={user}
                    onEdit={handleEditUser}
                    onDelete={handleDeleteUser}
                  />
                ))}
              </div>
            )}
            
            {/* Edit User Form - Modal style */}
            {editMode && selectedUser && (
              <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 relative">
                  <div className="flex justify-between items-center mb-4 border-b pb-3">
                    <h4 className="font-medium text-lg">Edit User: {selectedUser.username}</h4>
                    <button
                      onClick={cancelEdit}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                
                <form onSubmit={handleUpdateUser}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      name="username"
                      value={newUser.username}
                      onChange={handleInputChangeForMobileUser}
                      className="block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2 text-gray-900 dark:text-white"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Password (leave empty to keep current)
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={newUser.password}
                      onChange={handleInputChangeForMobileUser}
                      className="block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2 text-gray-900 dark:text-white"
                      placeholder="********"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Permission Level
                    </label>
                    <select
                      name="permissionLevel"
                      value={newUser.permissionLevel}
                      onChange={handleInputChangeForMobileUser}
                      className="block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 py-2 text-gray-900 dark:text-white"
                    >
                      <option value="read">Read Only</option>
                      <option value="readwrite">Read & Write</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-4 py-2 bg-gray-200 text-gray-800 font-medium text-sm rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {isLoading ? "Updating..." : "Update User"}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudSettingsPage;