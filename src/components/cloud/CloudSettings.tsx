'use client';

import React, { useState, useEffect } from 'react';
import { showToast } from '@/components/ui/alert';

interface CloudSettings {
  serverIP: string;
  serverPort: string;
  apiPort?: string;  // API için ikinci port
  isEnabled: boolean;
  lastConnectionTest?: Date;
  connectionStatus?: 'connected' | 'disconnected' | 'testing';
}

interface CloudSettingsProps {
  onSettingsChange?: (settings: CloudSettings) => void;
}

export default function CloudSettings({ onSettingsChange }: CloudSettingsProps) {
  const [settings, setSettings] = useState<CloudSettings>({
    serverIP: '',
    serverPort: '3000',
    apiPort: '3001',
    isEnabled: false,
    connectionStatus: 'disconnected'
  });

  const [isTesting, setIsTesting] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState<any>(null);

  // Load settings from API on component mount, then from localStorage
  useEffect(() => {
    // Önce API'den verileri çek
    const fetchSettings = async () => {
      try {
        console.log('Fetching cloud settings from API...');
        const response = await fetch('/api/cloud-settings');
        
        if (response.ok) {
          const data = await response.json();
          console.log('Cloud settings API response:', data);
          
          if (data.success && data.settings) {
            // API'den gelen verileri state'e aktar
            setSettings(prev => ({
              ...prev,
              serverIP: data.settings.serverIP || '',
              serverPort: data.settings.serverPort || '3000',
              apiPort: data.settings.apiPort || '3001',
              isEnabled: data.settings.isEnabled === true,
              connectionStatus: data.settings.connectionStatus || 'disconnected',
              lastConnectionTest: data.settings.lastConnectionTest ? new Date(data.settings.lastConnectionTest) : undefined
            }));
            
            // API'den gelen verileri localStorage'a da kaydet
            localStorage.setItem('cloud-settings', JSON.stringify({
              serverIP: data.settings.serverIP || '',
              serverPort: data.settings.serverPort || '3000',
              apiPort: data.settings.apiPort || '3001',
              isEnabled: data.settings.isEnabled === true,
              connectionStatus: data.settings.connectionStatus || 'disconnected',
              lastConnectionTest: data.settings.lastConnectionTest
            }));
            
            console.log('Cloud settings loaded from API successfully');
            return;
          }
        } else {
          console.error('Failed to fetch cloud settings from API:', response.status);
        }
      } catch (error) {
        console.error('Error fetching cloud settings from API:', error);
      }
      
      // API'den veri çekme başarısız olursa localStorage'dan oku
      const savedSettings = localStorage.getItem('cloud-settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings(prev => ({ ...prev, ...parsed }));
          console.log('Cloud settings loaded from localStorage instead');
        } catch (error) {
          console.error('Error loading cloud settings from localStorage:', error);
        }
      }
    };
    
    fetchSettings();
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cloud-settings', JSON.stringify(settings));
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const handleInputChange = (field: keyof CloudSettings, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const testConnection = async () => {
    if (!settings.serverIP || !settings.serverPort || !settings.apiPort) {
      showToast('Lütfen sunucu IP ve port bilgilerini girin', 'error');
      return;
    }

    setIsTesting(true);
    setSettings(prev => ({ ...prev, connectionStatus: 'testing' }));

    // Timeout için AbortController kullan
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout

    try {
      const serverIP = settings.serverIP.trim();
      
      // WebSocket portu kontrolü (bilgi amaçlı)
      console.log(`WebSocket portu (${settings.serverPort}) kontrol ediliyor...`);
      
      // API portu kontrolü - gerçek istek burada yapılıyor
      const apiBaseUrl = serverIP.startsWith('http://') || serverIP.startsWith('https://')
        ? `${serverIP}:${settings.apiPort}`
        : `http://${serverIP}:${settings.apiPort}`;
      
      console.log(`Testing API connection to: ${apiBaseUrl}/api/mobile/system-info`);
      
      // API istekleri için kullanılan port üzerinden test yap
      const response = await fetch(`${apiBaseUrl}/api/mobile/system-info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        mode: 'cors',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);
        
        // Hem WebSocket hem de API bağlantısının başarılı olduğunu test et
        showToast(`API portu (${settings.apiPort}) bağlantısı başarılı!`, 'success');
        
        // WebSocket portu için de bilgi ver
        console.log(`WebSocket portu (${settings.serverPort}) için bağlantı bilgisi: Bu bağlantı mobil uygulama tarafından yapılır.`);
        
        setSettings(prev => ({
          ...prev,
          connectionStatus: 'connected',
          lastConnectionTest: new Date()
        }));
        
        // Başarılı bağlantı sonrası otomatik senkronizasyon başlat
        startAutoSync();
      } else {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Connection test failed:', error);
      setSettings(prev => ({
        ...prev,
        connectionStatus: 'disconnected'
      }));

      let errorMessage = 'Bilinmeyen hata';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Bağlantı zaman aşımı (10 saniye)';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Ağ hatası - Sunucuya erişilemiyor. IP adresi ve port doğru mu?';
        } else if (error.message.includes('CORS')) {
          errorMessage = 'CORS hatası - Sunucu CORS ayarlarını kontrol edin';
        } else {
          errorMessage = error.message;
        }
      }

      console.error('Detailed error info:', {
        error: error instanceof Error ? error.message : error,
        serverIP: settings.serverIP,
        serverPort: settings.serverPort,
        apiPort: settings.apiPort,
        url: `http://${settings.serverIP}:${settings.apiPort}/api/mobile/system-info`,
        timestamp: new Date().toISOString()
      });

      showToast(`Bağlantı başarısız: ${errorMessage}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      showToast('Ayarlar kaydediliyor...', 'info');
      
      // Settings'i MongoDB'ye kaydet
      const response = await fetch('/api/cloud-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Save settings result:', result);
        
        showToast('Ayarlar başarıyla kaydedildi', 'success');
        
        // Ayarlar kaydedildikten sonra API'den tekrar çek (veriler güncellenmiş olabilir)
        const refreshResponse = await fetch('/api/cloud-settings');
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          if (refreshData.success && refreshData.settings) {
            // API'den gelen güncel verileri state'e aktar
            setSettings(prev => ({
              ...prev,
              serverIP: refreshData.settings.serverIP || '',
              serverPort: refreshData.settings.serverPort || '3000',
              isEnabled: refreshData.settings.isEnabled === true,
              connectionStatus: refreshData.settings.connectionStatus || 'disconnected',
              lastConnectionTest: refreshData.settings.lastConnectionTest ? new Date(refreshData.settings.lastConnectionTest) : undefined
            }));
            
            console.log('Cloud settings refreshed after save');
          }
        }
      } else {
        throw new Error('Ayarlar kaydedilemedi');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      showToast('Ayarlar kaydedilirken hata oluştu', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = () => {
    switch (settings.connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'testing': return 'text-yellow-600';
      case 'disconnected': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (settings.connectionStatus) {
      case 'connected': return 'Bağlı';
      case 'testing': return 'Test Ediliyor...';
      case 'disconnected': return 'Bağlı Değil';
      default: return 'Bilinmiyor';
    }
  };

  // Otomatik senkronizasyon fonksiyonları
  const startAutoSync = async () => {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
    }

    if (!settings.isEnabled || settings.connectionStatus !== 'connected') {
      return;
    }

    // Her 60 saniyede bir manuel senkronizasyon başlat
    const interval = setInterval(async () => {
      try {
        await fetch('/express-api/sync-to-cloud', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log('🔄 Otomatik cloud senkronizasyonu tamamlandı');
      } catch (error) {
        console.error('Otomatik senkronizasyon hatası:', error);
      }
    }, 60000); // 60 saniye

    setAutoSyncInterval(interval);
    showToast('Otomatik senkronizasyon başlatıldı (60 saniye aralıklarla)', 'success');

    // İlk senkronizasyonu hemen başlat
    setTimeout(async () => {
      try {
        await fetch('/express-api/sync-to-cloud', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        showToast('İlk senkronizasyon tamamlandı', 'success');
      } catch (error) {
        console.error('İlk senkronizasyon hatası:', error);
      }
    }, 2000);
  };

  const stopAutoSync = () => {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      setAutoSyncInterval(null);
      showToast('Otomatik senkronizasyon durduruldu', 'info');
    }
  };

  // Settings değiştiğinde senkronizasyonu yeniden başlat/durdur
  useEffect(() => {
    if (settings.isEnabled && settings.connectionStatus === 'connected') {
      startAutoSync();
    } else {
      stopAutoSync();
    }

    // Component unmount olduğunda temizle
    return () => {
      stopAutoSync();
    };
  }, [settings.isEnabled, settings.connectionStatus]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">
          ☁️ Cloud Sunucu Ayarları
        </h2>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-medium text-gray-700">Cloud Bağlantısı</h3>
            <p className="text-sm text-gray-500">
              Mobil uygulama ile veri paylaşımı için cloud sunucusunu etkinleştirin
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.isEnabled}
              onChange={(e) => handleInputChange('isEnabled', e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {settings.isEnabled && (
          <>
            {/* Server IP */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sunucu IP Adresi
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="örn: 192.168.1.100 veya http://192.168.1.100"
                value={settings.serverIP}
                onChange={(e) => handleInputChange('serverIP', e.target.value)}
              />
            </div>

            {/* Server Port */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WebSocket Portu
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.serverPort}
                onChange={(e) => handleInputChange('serverPort', e.target.value)}
              >
                <option value="3000">3000 (Varsayılan WebSocket)</option>
                <option value="3001">3001</option>
                <option value="8080">8080</option>
                <option value="9000">9000</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                WebSocket bağlantıları için kullanılır (mobil uygulama real-time veri için bu porta bağlanır)
              </p>
            </div>

            {/* API Port */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Portu
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.apiPort}
                onChange={(e) => handleInputChange('apiPort', e.target.value)}
              >
                <option value="3001">3001 (Varsayılan API)</option>
                <option value="3000">3000</option>
                <option value="8080">8080</option>
                <option value="9000">9000</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                API istekleri için kullanılır (mobil uygulama veri çekmek için bu porta bağlanır)
              </p>
            </div>

            {/* Connection Status */}
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Bağlantı Durumu:
                </span>
                <span className={`text-sm font-semibold ${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>
              {settings.lastConnectionTest && (
                <p className="text-xs text-gray-500 mt-1">
                  Son test: {new Date(settings.lastConnectionTest).toLocaleString('tr-TR')}
                </p>
              )}
            </div>

            {/* Test Connection Button */}
            <div className="mb-4">
              <button
                onClick={testConnection}
                disabled={isTesting || !settings.serverIP}
                className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
                  isTesting || !settings.serverIP
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isTesting ? '🔄 Test Ediliyor...' : '🔗 Bağlantıyı Test Et'}
              </button>
            </div>

            {/* Save Settings Button */}
            <div className="mb-4">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
                  isSaving
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isSaving ? '⏳ Kaydediliyor...' : '💾 Ayarları Kaydet'}
              </button>
            </div>

            {/* Current Settings Display */}
            {(settings.serverIP) && (
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <h4 className="text-sm font-medium text-blue-800 mb-2">
                  ⚙️ Geçerli Yapılandırma:
                </h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>Sunucu: {settings.serverIP || 'Belirtilmemiş'}</p>
                  <p>WebSocket Portu: <span className="font-semibold">{settings.serverPort}</span> (real-time veri için)</p>
                  <p>API Portu: <span className="font-semibold">{settings.apiPort}</span> (HTTP istekleri için)</p>
                  <p className="mt-2 pt-2 border-t border-blue-100">WebSocket URL: {settings.serverIP.trim().startsWith('http') ?
                    `${settings.serverIP}:${settings.serverPort}` :
                    `http://${settings.serverIP}:${settings.serverPort}`}</p>
                  <p>API URL: {settings.serverIP.trim().startsWith('http') ?
                    `${settings.serverIP}:${settings.apiPort}/api/...` :
                    `http://${settings.serverIP}:${settings.apiPort}/api/...`}</p>
                  <p className="text-xs text-gray-500 mt-1">Not: IP adresini "http://" olmadan ya da "http://" ile birlikte girebilirsiniz.</p>
                  
                  {settings.connectionStatus === 'connected' && (
                    <div className="mt-3 pt-2 border-t border-blue-100">
                      <p className="text-green-600 font-medium">
                        ✅ Otomatik senkronizasyon aktif (60 saniye aralıklarla)
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Bu ayarlar ile mobil uygulama ve SCADA, köprü sunucusu üzerinden haberleşebilir
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Troubleshooting Section */}
        {settings.isEnabled && settings.connectionStatus === 'disconnected' && (
          <div className="mt-6 p-4 bg-red-50 rounded-md">
            <h4 className="text-sm font-medium text-red-800 mb-2">
              🔧 Sorun Giderme:
            </h4>
            <div className="text-sm text-red-700 space-y-2">
              <p><strong>Sunucunuzda şu kontrolleri yapın:</strong></p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li><code>cd mobile-api-server && npm start</code> ile sunucuyu çalıştırın</li>
                <li><code>netstat -an | findstr :{settings.serverPort}</code> ile port açık mı kontrol edin</li>
                <li><code>netsh advfirewall firewall add rule name="Mobile API Port {settings.serverPort}" dir=in action=allow protocol=TCP localport={settings.serverPort}</code> ile firewall'da port açın</li>
                <li>Sunucu loglarında "✅ Mobile API Log Server port {settings.serverPort}'de çalışıyor" mesajını arayın</li>
              </ol>
              <p className="mt-2"><strong>Test için sunucunuzda:</strong> <code>curl http://localhost:{settings.serverPort}/api/mobile/system-info</code></p>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-6 p-4 bg-yellow-50 rounded-md">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">
            ℹ️ Bilgilendirme:
          </h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Cloud bağlantısı açıkken SCADA verileri sunucuya gönderilir</li>
            <li>• Mobil uygulamalar sunucudan veri alabilir</li>
            <li>• Bağlantı testi yapmadan kaydetmeyin</li>
            <li>• Güvenlik duvarında portları açmayı unutmayın</li>
          </ul>
        </div>
      </div>
    </div>
  );
}