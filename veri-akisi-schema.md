# SCADA-Mobile Veri Akış Şeması ve Kod Açıklamaları

## 1. Veri Akış Şeması

```
┌───────────────────┐          ┌──────────────────────┐          ┌────────────────┐
│                   │          │                      │          │                │
│  SCADA Sistemi    │  ────►   │  Mobile API Server   │  ────►   │  Mobil Uygulama │
│  (main app)       │          │  (köprü/bridge)      │          │  (scada-mobile) │
│                   │          │                      │          │                │
└───────────────────┘          └──────────────────────┘          └────────────────┘
       ▲                                   │                              │
       │                                   │                              │
       └───────────────────────────────────┘◄─────────────────────────────┘
                     Yazma İstekleri (Register Write)
```

## 2. Veri Akış Detayları

### A. SCADA → Mobile API Server

SCADA sisteminden API server'a veri akışı iki şekilde gerçekleşir:

1. **HTTP POST İstekleri**: REST API üzerinden JSON verisi gönderimi
2. **WebSocket Bağlantısı**: Gerçek zamanlı veri güncellemeleri

### B. Mobile API Server → Mobil Uygulama

API server'dan mobil uygulamaya veri akışı:

1. **HTTP GET İstekleri**: Mobil uygulama tarafından yapılan API çağrıları
2. **WebSocket Güncellemeleri**: Gerçek zamanlı veri gönderimi
   - Tekli güncellemeler: `register-value` olayı
   - Toplu güncellemeler: `register-values-batch` olayı

### C. Mobil Uygulama → Mobile API Server → SCADA

Mobil uygulamadan SCADA'ya kontrol komutları:

1. **Register Yazma İstekleri**: Mobil uygulamadan API server üzerinden SCADA'ya

## 3. Veri Akışı Kodları ve Açıklamaları

### 3.1. SCADA Sistemi (service_new.ts)

```typescript
// Analyzer verisini API server'a gönderme
async function sendAnalyzersToCloud(analyzers: any[]) {
  try {
    const response = await axios.post(
      `${cloudSettings.serverUrl}/api/scada/analyzers`,
      { analyzers }
    );
    return response.data;
  } catch (error) {
    console.error("Analyzers gönderilemedi:", error);
    return null;
  }
}

// Register değerlerini gönderme
async function sendRegistersToCloud(registers: any[]) {
  try {
    const response = await axios.post(
      `${cloudSettings.serverUrl}/api/scada/registers`,
      { registers }
    );
    return response.data;
  } catch (error) {
    console.error("Registers gönderilemedi:", error);
    return null;
  }
}

// WebSocket ile register değerlerini gerçek zamanlı gönderme
function sendRegisterUpdateToCloud(registerId, value, analyzerId, address) {
  if (cloudSocket && cloudSocket.connected) {
    cloudSocket.emit('register-update', {
      registerId,
      analyzerId,
      address,
      value,
      timestamp: Date.now(),
      dataType: 'number'
    });
  }
}
```

### 3.2. Mobile API Server (Bridge)

#### 3.2.1. Veri Alımı (handlers.js)

```javascript
// HTTP POST verilerini işle
socket.on('scada-data', (data) => {
  if (socket.clientType === 'scada') {
    const { endpoint, data: postData, timestamp } = data;
    
    // Endpoint'e göre veriyi işle
    if (endpoint === '/api/scada/registers' && postData.registers) {
      // Register verilerini işle
      const { scadaData } = require('../models/scada-data');
      scadaData.registers = postData.registers;
      scadaData.lastUpdate = new Date().toISOString();
      
      console.log(`📊 ${postData.registers.length} register verisi güncellendi`);
    }
    
    // Tüm mobil istemcilere güncellenmiş verileri bildir
    const { broadcastToMobileClients } = require('./manager');
    broadcastToMobileClients('scada-data-updated', {
      endpoint,
      timestamp: new Date().toISOString(),
      source: 'scada-websocket'
    });
  }
});

// Register değeri güncellemesi (SCADA'dan gelen)
socket.on('register-update', (data) => {
  if (socket.clientType === 'scada') {
    handleRegisterUpdate(data, socket);
  }
});
```

#### 3.2.2. Veri İşleme ve Önbellek (models/scada-data.js)

```javascript
// SCADA verilerini tutmak için bellek içi storage
const scadaData = {
  registers: [],
  analyzers: [],
  widgets: [],
  trendLogs: [],
  systemInfo: {},
  lastUpdate: new Date().toISOString()
};

// WebSocket connections için storage
const mobileConnections = new Map(); // Mobil uygulama bağlantıları
const scadaConnections = new Map();  // SCADA sistemi bağlantıları

// Register değerlerini cache'lemek için
const registerCache = new Map();
```

#### 3.2.3. Veri Gönderimi (manager.js)

```javascript
// Tüm mobil bağlantılara veri gönder
const broadcastToMobileClients = (eventName, data) => {
  let count = 0;
  
  mobileConnections.forEach((socket, id) => {
    try {
      if (socket && socket.connected) {
        socket.emit(eventName, data);
        count++;
      }
    } catch (error) {
      console.error(`❌ [${id}] Veri gönderirken hata: ${error.message}`);
    }
  });
  
  return count;
};

// Register değeri güncellemesi (SCADA'dan gelen)
const handleRegisterUpdate = (data, socket) => {
  const { registerCache } = require('../models/scada-data');
  
  try {
    const { registerId, analyzerId, address, value, dataType, bit } = data;
    const now = Date.now();
    const timestamp = new Date(now).toISOString();

    // Cache'e kaydet
    const cacheKey = dataType === 'boolean' && typeof bit === 'number'
      ? `${analyzerId}-${address}-bit${bit}`
      : `${analyzerId}-${address}`;

    registerCache.set(cacheKey, {
      value,
      timestamp: now,
      registerId,
      analyzerId,
      address,
      dataType,
      bit
    });

    // Gerçek zamanlı değerleri gönder
    broadcastToMobileClients('register-value', {
      registerId,
      analyzerId,
      address,
      value,
      timestamp: now,
      dataType,
      bit,
      source: 'scada-bridge'
    });
    
    // Toplu değerleri de gönder (5 saniyede bir)
    const allCachedValues = Array.from(registerCache.values());
    broadcastToMobileClients('register-values-batch', {
      values: allCachedValues,
      timestamp: now,
      count: allCachedValues.length,
      source: 'scada-bridge-batch'
    });
  } catch (error) {
    console.error('Register update handling error:', error);
  }
};

// Register yazma isteği (Mobil'den gelen)
const handleRegisterWrite = (data, socket) => {
  try {
    const { registerId, value } = data;

    // Tüm SCADA bağlantılarına ilet
    scadaConnections.forEach((scadaSocket, id) => {
      if (scadaSocket.connected) {
        scadaSocket.emit('mobile-write-request', {
          registerId,
          value,
          timestamp: Date.now(),
          source: 'mobile-bridge',
          mobileSocketId: socket.id
        });
      }
    });
  } catch (error) {
    console.error('Register write handling error:', error);
  }
};
```

### 3.3. Mobil Uygulama (scada-mobile)

#### 3.3.1. Bağlantı ve Veri Alımı (WebSocketContext.tsx)

```typescript
// WebSocket bağlantısı kurulduğunda
newSocket.on('connect', () => {
  console.log('[SocketIO] Connected to mobile');
  setIsConnected(true);
  setConnectionState('connected');
  
  // Bağlantı kurulduğunda identify olayını gönder
  newSocket.emit('identify', { 
    type: 'mobile', 
    source: 'mobile-app' 
  });
  
  // Mevcut abonelikleri yeniden gönder
  for (const [key, data] of listenerMapRef.current.entries()) {
    if (data.callbacks.length > 0) {
      console.log(`[SocketIO] Resubscribing to: ${key}`);
      newSocket.emit('watch-register', data.register);
    }
  }
});

// Tekli register değeri alma
newSocket.on('register-value', (data: RegisterValue) => {
  const key = data.dataType === 'boolean' && typeof data.bit === 'number'
    ? `${data.analyzerId}-${data.address}-bit${data.bit}`
    : `${data.analyzerId}-${data.address}`;
    
  // Değeri cache'le
  setCachedValue(key, data.value);
  
  // Register values map'ini güncelle
  setRegisterValues(prev => {
    const newMap = new Map(prev);
    newMap.set(key, data);
    return newMap;
  });
    
  // Dinleyicilere bildir
  const listeners = listenerMapRef.current.get(key);
  if (listeners && listeners.callbacks) {
    listeners.callbacks.forEach((callback: (value: any) => void) => {
      callback(data.value);
    });
  }
});

// Toplu register değerleri alma
newSocket.on('register-values-batch', (data: {values: RegisterValue[]}) => {
  console.log(`[SocketIO] Received batch update with ${data.values?.length || 0} values`);
  
  if (data.values && Array.isArray(data.values)) {
    // Yeni bir map oluştur
    const newRegisterValues = new Map(registerValues);
    
    data.values.forEach(item => {
      const key = item.dataType === 'boolean' && typeof item.bit === 'number'
        ? `${item.analyzerId}-${item.address}-bit${item.bit}`
        : `${item.analyzerId}-${item.address}`;
        
      // Değeri cache'le
      setCachedValue(key, item.value);
      
      // Map'i güncelle
      newRegisterValues.set(key, item);
      
      // Dinleyicilere bildir
      const listeners = listenerMapRef.current.get(key);
      if (listeners && listeners.callbacks) {
        listeners.callbacks.forEach((callback: (value: any) => void) => {
          callback(item.value);
        });
      }
    });
    
    // State'i bir kerede güncelle
    setRegisterValues(newRegisterValues);
  }
});
```

#### 3.3.2. HTTP İstek ve Yazma İşlemleri (ApiService.ts)

```typescript
// Register değeri yazma
async function writeRegisterValue(registerId: string, value: number): Promise<any> {
  try {
    const settings = await getServerSettings();
    const url = `${getBaseUrl(settings)}/api/mobile/registers/write`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ registerId, value }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error writing register:', error);
    throw error;
  }
}

// HTTP API endpoint'lerine istek gönderme
async function getSystemInfo(): Promise<SystemInfo> {
  try {
    const settings = await getServerSettings();
    const url = `${getBaseUrl(settings)}/api/mobile/system-info`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting system info:', error);
    throw error;
  }
}
```

## 4. Veri Akış Türleri

### 4.1. REST API Endpointleri

#### SCADA → API Server
- **POST /api/scada/registers** - Register verilerini gönder
- **POST /api/scada/analyzers** - Analizör verilerini gönder 
- **POST /api/scada/widgets** - Widget verilerini gönder
- **POST /api/scada/trend-logs** - Trend log verilerini gönder

#### API Server → Mobil Uygulama
- **GET /api/mobile/data** - Tüm verileri al
- **GET /api/mobile/registers** - Register verilerini al
- **GET /api/mobile/analyzers** - Analizörleri listele
- **GET /api/mobile/widgets** - Widget'ları listele
- **GET /api/system-info** - Sistem bilgilerini al

#### Mobil → API Server → SCADA
- **POST /api/mobile/registers/write** - Register değeri yaz

### 4.2. WebSocket Olayları

#### SCADA → API Server
- **identify** - Bağlantı türünü tanımla (type: "scada")
- **register-update** - Register değeri güncelle

#### API Server → Mobil Uygulama
- **register-value** - Tekil register değeri gönder
- **register-values-batch** - Toplu register değerlerini gönder
- **scada-data-updated** - SCADA verilerinde güncelleme olduğunu bildir

#### Mobil Uygulama → API Server → SCADA
- **identify** - Bağlantı türünü tanımla (type: "mobile")
- **register-write** - Register değeri yazma isteği gönder
- **sync-request** - Tüm verileri senkronize etme isteği gönder

## 5. Özet

1. SCADA uygulaması, analizörlerden toplanan verileri `service_new.ts` aracılığıyla API Server'a gönderir.
2. API Server bu verileri alır, işler ve önbelleğe (cache) kaydeder.
3. Mobil uygulama, API Server'a bağlanır ve WebSocket ile gerçek zamanlı güncellemeleri alır.
4. Mobil uygulama ayrıca HTTP API endpointlerini kullanarak daha büyük veri kümelerini alabilir.
5. Mobil uygulama üzerinden yapılan değişiklikler, ters yönde SCADA'ya geri gönderilir.

Bu veri akış mimarisi, SCADA sisteminden mobil uygulamaya güvenilir ve gerçek zamanlı bir köprü sağlar.
