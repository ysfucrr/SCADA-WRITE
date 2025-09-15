const ModbusRTU = require("modbus-serial");

// ───────────── AYARLAR ─────────────
const NUM_DEVICES = 40;
const FLOATS_PER_DEVICE = 20;
const REGISTER_PER_FLOAT = 2;
const REGISTERS_PER_DEVICE = FLOATS_PER_DEVICE * REGISTER_PER_FLOAT;
const DEVICE_OFFSET = REGISTERS_PER_DEVICE;
const TOTAL_REGISTERS = 65536;
const IP_ADDRESS = "0.0.0.0";
const PORT = 8505;

// ────── Tüm register’ları tutan buffer (65536 × 2 byte)
const holdingRegisters = Buffer.alloc(TOTAL_REGISTERS * 2);

// ────── Her analizör için kWh değerleri (slave ID'ye göre başlangıç değeri)
const kwhValues = Array(NUM_DEVICES + 1).fill(0).map((_, i) => (i > 0 ? i - 1 : 0.0));

// ────── Bit-level registerlar için durumlar
let bitStates = { 3: false, 15: false };
const BIT_MASKS = { 3: 0x0008, 15: 0x8000 };

// ────── HELPER: 32‑bit float’ı iki register’a yaz (daha verimli)
function writeFloatToHoldingReg(addr, value) {
  holdingRegisters.writeFloatBE(value, addr * 2);
}

// ────── HELPER: 16‑bit unsigned’ı tek register’a yaz
function writeUInt16ToHoldingReg(addr, value) {
  holdingRegisters.writeUInt16BE(value, addr * 2);
}

// ────── 1) Her dakikada bir kWh değerlerini artır
setInterval(() => {
  for (let slave = 1; slave <= NUM_DEVICES; slave++) {
    kwhValues[slave] += 1.0;
  }
  console.log("🔄 [Sim] Tüm analizörlerin kWh değerleri güncellendi.");
}, 60_000);

// ────── 2) Bit durumlarını periyodik olarak değiştir
setInterval(() => {
  bitStates[3] = !bitStates[3];
  bitStates[15] = !bitStates[15];
}, 60_000);

// ────── 3) Her saniye: tüm elektriksel register’ları güncelle (optimize edilmiş)
setInterval(() => {
  let boolRegValue = 0x0000;
  if (bitStates[3]) boolRegValue |= BIT_MASKS[3];
  if (bitStates[15]) boolRegValue |= BIT_MASKS[15];

  for (let slave = 1; slave <= NUM_DEVICES; slave++) {
    const baseAddr = (slave - 1) * DEVICE_OFFSET;

    // Elektriksel değerleri rastgele oluştur ve yaz
    writeFloatToHoldingReg(baseAddr + 0, 220 + Math.random() * 2); // V1
    writeFloatToHoldingReg(baseAddr + 2, 220 + Math.random() * 2); // V2
    writeFloatToHoldingReg(baseAddr + 4, 220 + Math.random() * 2); // V3
    writeFloatToHoldingReg(baseAddr + 14, kwhValues[slave]);       // Toplam kWh
    writeFloatToHoldingReg(baseAddr + 16, Math.random() * 10);     // Anlık kW
    writeFloatToHoldingReg(baseAddr + 20, 50.1 + Math.random() * 0.4); // Frekans

    // 18 numaralı register: sadece slave 1‑2 için bool değerleri
    if (slave === 1 || slave === 2) {
      writeUInt16ToHoldingReg(baseAddr + 18, boolRegValue);
    }
  }
}, 1_000);

// ────── VECTOR TABANLI MODBUS SUNUCUSU ──────
const vector = {
  getHoldingRegister(addr, unitID, callback) {
    // [İYİLEŞTİRME] Gerçekçi bir yerel ağ gecikmesi simülasyonu (düşük tutuldu)
    const latency = 10 + Math.random() * 20; // 10-30ms arası, çok daha hızlı yanıt

    setTimeout(() => {
      if (unitID < 1 || unitID > NUM_DEVICES) {
        return callback({ modbusErrorCode: 0x02 }); // Illegal Data Address
      }
      
      const realAddr = (unitID - 1) * DEVICE_OFFSET + addr;
      if (realAddr < 0 || realAddr >= TOTAL_REGISTERS) {
        return callback({ modbusErrorCode: 0x02 }); // Illegal Data Address
      }

      const value = holdingRegisters.readUInt16BE(realAddr * 2);
      callback(null, value);
    }, latency);
  },
  // Desteklenmeyen fonksiyonlar için hata döndür
  getInputRegister: (_, __, cb) => cb({ modbusErrorCode: 0x01 }),
  getCoil: (_, __, cb) => cb({ modbusErrorCode: 0x01 }),
  getDiscreteInput: (_, __, cb) => cb({ modbusErrorCode: 0x01 }),
  setRegister(addr, value, unitID, callback) {
    if (unitID === 1 && addr === 1280) {
      console.log(
        `[Sim] Yazma isteği alındı: Slave ID=${unitID}, Adres=${addr}, Değer=${value} (int16)`
      );
      // Gelen değeri 16-bit integer olarak Buffer'a yaz
      const realAddr = (unitID - 1) * DEVICE_OFFSET + addr;
      if (realAddr < 0 || realAddr >= TOTAL_REGISTERS) {
        return callback({ modbusErrorCode: 0x02 }); // Illegal Data Address
      }
      holdingRegisters.writeInt16BE(value, realAddr * 2);
    }
    // Diğer tüm yazma isteklerini şimdilik yok sayabiliriz veya loglayabiliriz.
    // Başarılı yanıt gönder
    callback();
  },
};

// ────── MODBUS TCP SUNUCUSUNU BAŞLAT ──────
new ModbusRTU.ServerTCP(
  vector,
  { host: IP_ADDRESS, port: PORT, debug: false, unitID: null }, // debug=false daha az konsol çıktısı için
  () =>
    console.log(`✅ Hızlı Modbus Simülatörü dinlemede: ${IP_ADDRESS}:${PORT}`)
);
