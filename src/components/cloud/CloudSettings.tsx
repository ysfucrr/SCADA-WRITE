'use client';

import React, { useState, useEffect } from 'react';
import { showToast } from '@/components/ui/alert';

interface CloudSettings {
  serverIP: string;
  serverPort: string;
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
    isEnabled: false,
    connectionStatus: 'disconnected'
  });

  const [isTesting, setIsTesting] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState<any>(null);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('cloud-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Error loading cloud settings:', error);
      }
    }
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
    if (!settings.serverIP || !settings.serverPort) {
      showToast('Lütfen sunucu IP ve port bilgilerini girin', 'error');
      return;
    }

    setIsTesting(true);
    setSettings(prev => ({ ...prev, connectionStatus: 'testing' }));

    // Timeout için AbortController kullan
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout

    try {
      console.log(`Testing connection to: http://${settings.serverIP}:${settings.serverPort}/api/mobile/system-info`);

      // URL oluşturmadan önce protokol kontrolü yap
      const serverIP = settings.serverIP.trim();
      const baseUrl = serverIP.startsWith('http://') || serverIP.startsWith('https://')
        ? `${serverIP}:${settings.serverPort}`
        : `http://${serverIP}:${settings.serverPort}`;
        
      console.log(`Testing connection to: ${baseUrl}/api/mobile/system-info`);
      const response = await fetch(`${baseUrl}/api/mobile/system-info`, {
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
        setSettings(prev => ({
          ...prev,
          connectionStatus: 'connected',
          lastConnectionTest: new Date()
        }));
        showToast('Sunucuya başarıyla bağlandı!', 'success');

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
        url: `http://${settings.serverIP}:${settings.serverPort}/api/mobile/system-info`,
        timestamp: new Date().toISOString()
      });

      showToast(`Bağlantı başarısız: ${errorMessage}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const saveSettings = async () => {
    try {
      // Settings'i MongoDB'ye kaydet
      const response = await fetch('/api/cloud-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        showToast('Ayarlar başarıyla kaydedildi', 'success');
      } else {
        throw new Error('Ayarlar kaydedilemedi');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      showToast('Ayarlar kaydedilirken hata oluştu', 'error');
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
                Sunucu Port
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.serverPort}
                onChange={(e) => handleInputChange('serverPort', e.target.value)}
              >
                <option value="3000">3000 (Varsayılan)</option>
                <option value="3001">3001</option>
                <option value="8080">8080</option>
                <option value="9000">9000</option>
              </select>
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
                  Son test: {settings.lastConnectionTest.toLocaleString('tr-TR')}
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
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors"
              >
                💾 Ayarları Kaydet
              </button>
            </div>

            {/* Current Settings Display */}
            {(settings.serverIP || settings.serverPort !== '3000') && (
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <h4 className="text-sm font-medium text-blue-800 mb-2">
                  ⚙️ Geçerli Yapılandırma:
                </h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>Sunucu: {settings.serverIP || 'Belirtilmemiş'}</p>
                  <p>Port: {settings.serverPort}</p>
                  <p>URL: {settings.serverIP.trim().startsWith('http') ? `${settings.serverIP}:${settings.serverPort}` : `http://${settings.serverIP}:${settings.serverPort}`}</p>
                  <p className="text-xs text-gray-500">Not: IP adresini "http://" olmadan ya da "http://" ile birlikte girebilirsiniz.</p>
                  {settings.connectionStatus === 'connected' && (
                    <p className="text-green-600 font-medium">
                      ✅ Otomatik senkronizasyon aktif (60 saniye aralıklarla)
                    </p>
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