// ────────── Yardımcı Fonksiyonlar ──────────
/* eslint-disable @typescript-eslint/no-explicit-any */
import { backendLogger } from '../logger/BackendLogger';

const MAX_MISS = 40;


export interface RegisterConfig {
    id: string;
    _id?: string;
    name: string;
    analyzerId: string;
    addr?: number;
    address?: number; // Alternatif isim
    buildingId: string; // The ID of the top-level building document
    dataType: string;
    byteOrder: string;
    scale: number;
    offset: number;
    bit: number;
    size: number;
    parentId: string;
    unit: number;
    onIcon?: string; // ON durumu için ikon URL veya yolu
    offIcon?: string; // OFF durumu için ikon URL veya yolu
}

// ────────── Temel Sınıflar ──────────
/**
 * Register sınıfı - Tek bir Modbus registerını temsil eder
 */
export class Register {
    id: string;
    analyzerId: string;
    name: string;
    addr: number;
    buildingId: string;
    dataType: string;
    byteOrder: string;
    scale: number;
    offset: number;
    bit: number;
    size: number;
    parentId: string;
    unit: number;
    onIcon?: string; // ON durumu için ikon URL veya yolu
    offIcon?: string; // OFF durumu için ikon URL veya yolu
    value: any = null;
    missCount: number = 0;
    lastUpdated: number = 0;
    lastTestTime: number = 0; // Otomatik iyileşme için son test zamanı

    constructor(config: RegisterConfig) {
        this.id = config.id;
        this.name = config.name;
        this.analyzerId = config.analyzerId;
        this.buildingId = config.buildingId;

        // Adres için hem addr hem address alanlarını kontrol et
        if (typeof config.addr === 'number') {
            this.addr = config.addr;
        } else if (typeof config.address === 'number') {
            this.addr = config.address;
        } else {
            backendLogger.warning(`Valid address not found for register ${config.id}. Both addr and address are undefined!`, "Register");
            this.addr = 0; // Varsayılan değer atıyoruz, ama bu sorunlu olabilir
        }

        this.dataType = config.dataType;
        this.byteOrder = config.byteOrder;
        this.scale = config.scale;
        this.offset = config.offset || 0;
        this.bit = config.bit;
        this.size = config.size;
        this.parentId = config.parentId;
        this.unit = config.unit;
        this.onIcon = config.onIcon;
        this.offIcon = config.offIcon;
    }

    /**
     * Register değerini ölçekli olarak döndürür
     * @param defaultValue Değer yoksa döndürülecek varsayılan değer
     */
    getValue(defaultValue: any = null): any {
        //console.log(`[REGISTER-GETVALUE] Register: id=${this.id}, analyzerId=${this.analyzerId}, addr=${this.addr}, bit=${this.bit}, dataType=${this.dataType}, value=${this.value}`);
        
        // Değer yoksa varsayılan değeri döndür
        if (this.value === null || this.value === undefined) {
            //console.log(`[REGISTER-GETVALUE] Değer null/undefined, defaultValue döndürülüyor: ${defaultValue}`);
            return defaultValue;
        }

        // Boolean register için sadece log (bit hesaplama decode'da yapılıyor)
        if (this.dataType === 'boolean') {
            //console.log(`[REGISTER-GETVALUE] Boolean register: value=${this.value}, bit=${this.bit}`);
        }

        // Sayısal değer ise ölçeklendir
        if (typeof this.value === 'number') {
            // Apply the formula: (Raw Value + Offset) * Scale
            const scaledValue = (this.value + this.offset) * this.scale;
            return Number(scaledValue.toFixed(2));
        }
        
        //console.log(`[REGISTER-GETVALUE] Ham değer döndürülüyor: ${this.value}`);
        return this.value;
    }

    /**
     * Ham veriyi register için decode eder ve saklar
     */
    decode(words: number[], blockStart: number): any {
        const i = this.addr - blockStart;  // Bloğun içindeki offset

        // Return error if register is outside of the block
        if (i < 0 || i >= words.length) {
            backendLogger.error(`Address ${this.addr} is outside of block! (block start=${blockStart}, length=${words.length})`, "Register");
            return null;
        }

        const scale = this.scale ?? 1;
        let value: any = null;

        try {
            /* ---------- 8-bit & 16-bit ---------- */
            if (
                this.dataType === "boolean" ||
                this.dataType === "int8" || this.dataType === "uint8" ||
                this.dataType === "int16" || this.dataType === "uint16"
            ) {
                const raw = words[i];

                /* Bit alanı (boolean) */
                if (this.dataType === "boolean") {
                    const bit = typeof this.bit === "number" ? this.bit : 0;
                    const numWords = Math.ceil((bit + 1) / 16);

                    // Check if there are enough words to read the requested bit.
                    if (i + numWords > words.length) {
                        backendLogger.error(`Insufficient data: ${this.id} (${numWords} registers required for bit ${bit}, ${words.length - i} available)`, "Register");
                        return null;
                    }

                    // Create a buffer from the relevant words
                    const relevantWords = words.slice(i, i + numWords);
                    const byteBuffer = Buffer.alloc(numWords * 2);
                    for (let k = 0; k < numWords; k++) {
                        byteBuffer.writeUInt16BE(relevantWords[k], k * 2);
                    }

                    // Apply byte order swapping if necessary
                    let orderedBuffer = byteBuffer;
                    // backendLogger.debug(`Byte Order Check: ${this.byteOrder || 'ABCD (default)'}, Original Data: ${byteBuffer.toString('hex')}`, "Register");

                    if (numWords > 1) { // Swapping is only needed for multi-word data
                        const mutableBuffer = Buffer.from(byteBuffer); // Create a mutable copy
                        if (this.byteOrder === "BADC") { mutableBuffer.swap16(); }
                        else if (this.byteOrder === "CDAB") { mutableBuffer.swap32(); }
                        else if (this.byteOrder === "DCBA") { mutableBuffer.swap32(); mutableBuffer.swap16(); }
                        
                        orderedBuffer = mutableBuffer;
                        //console.log(`[REGISTER-DECODE] Byte Order Uygulandı, Sıralı Veri: ${orderedBuffer.toString('hex')}`);
                    }
                    
                    // Now, find the correct word and bit in the (potentially swapped) buffer
                    const registerOffset = Math.floor(bit / 16);
                    const bitInWord = bit % 16;

                    const rawValue = orderedBuffer.readUInt16BE(registerOffset * 2);
                    //console.log(`[REGISTER-DECODE] Boolean decode: id=${this.id}, addr=${this.addr}+${registerOffset}, raw=${rawValue}, bit=${bitInWord}, totalBit=${bit}`);
                    
                    value = (((rawValue >> bitInWord) & 1) + this.offset) * scale;
                    //console.log(`[REGISTER-DECODE] Boolean decode sonucu: value=${value}`);
                } else {
                    /* 16-bit için byte sırası */
                    const buf16 = Buffer.from([raw >> 8, raw & 0xff]);
                    const b16 = Buffer.from(buf16); // Create a copy
                    if (this.byteOrder === "BA" || this.byteOrder === "BADC") {
                        b16.swap16();
                    }

                    switch (this.dataType) {
                        case "int8": value = (Buffer.from([raw & 0xff]).readInt8(0) + this.offset) * scale; break;
                        case "uint8": value = (Buffer.from([raw & 0xff]).readUInt8(0) + this.offset) * scale; break;
                        case "int16": value = (b16.readInt16BE(0) + this.offset) * scale; break;
                        case "uint16": value = (b16.readUInt16BE(0) + this.offset) * scale; break;
                    }
                }
            }
            /* ---------- 32-bit ---------- */
            else if (
                this.dataType === "int32" || this.dataType === "uint32" ||
                this.dataType === "float32"
            ) {
                // 32-bit için en az iki word gerekli, yetersizse hata ver
                if (i + 1 >= words.length) {
                    backendLogger.error(`Insufficient data for 32-bit data type: ${this.id}, addr=${this.addr}, blockSize=${words.length}`, "Register");
                    return null;
                }


                const buf32 = Buffer.from([
                    words[i] >> 8, words[i] & 0xff,
                    words[i + 1] >> 8, words[i + 1] & 0xff,
                ]);

                const b32 = Buffer.from(buf32); // Create a copy
                if (this.byteOrder === "BADC") b32.swap16();
                else if (this.byteOrder === "CDAB") b32.swap32();
                else if (this.byteOrder === "DCBA") { b32.swap32(); b32.swap16(); }

                if (this.dataType === "float32") value = (b32.readFloatBE(0) + this.offset) * scale;
                else if (this.dataType === "uint32") value = (b32.readUInt32BE(0) + this.offset) * scale;
                else value = (b32.readInt32BE(0) + this.offset) * scale; // int32
            }
            /* ---------- 64-bit ---------- */
            else if (
                this.dataType === "int64" || this.dataType === "uint64" ||
                this.dataType === "float64"
            ) {
                // 64-bit için en az dört word gerekli, yetersizse hata ver
                if (i + 3 >= words.length) {
                    backendLogger.error(`Insufficient data for 64-bit data type: ${this.id}, addr=${this.addr}, blockSize=${words.length}`, "Register");
                    return null;
                }

                const buf64 = Buffer.from([
                    words[i] >> 8, words[i] & 0xff,
                    words[i + 1] >> 8, words[i + 1] & 0xff,
                    words[i + 2] >> 8, words[i + 2] & 0xff,
                    words[i + 3] >> 8, words[i + 3] & 0xff,
                ]);

                const b64 = Buffer.from(buf64); // Create a copy
                if (this.byteOrder === "BADC") b64.swap16();
                else if (this.byteOrder === "CDAB") b64.swap32();
                else if (this.byteOrder === "DCBA") { b64.swap32(); b64.swap16(); }
                // Note: No native swap64, manual implementation would be needed.

                if (this.dataType === "float64") value = (b64.readDoubleBE(0) + this.offset) * scale;
                else {
                    const big = this.dataType === "uint64"
                        ? b64.readBigUInt64BE(0)
                        : b64.readBigInt64BE(0);

                    /* JS'te güvenli aralık aşılırsa BigInt olarak bırakın */
                    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
                    const num = (big > maxSafe || big < -maxSafe) ? big : Number(big);
                    value = ((typeof num === "number" ? num : Number(num)) + this.offset) * scale;
                }
            }
            /* ---------- String ---------- */
            else if (this.dataType === "string") {
                const size = Math.max(1, Number(this.size) || 1); // kaç 16-bit word

                // String için yeterli word var mı kontrol et
                if (i + size > words.length) {
                    backendLogger.error(`Insufficient data for string data type: ${this.id}, addr=${this.addr}, size=${size}, blockSize=${words.length}`, "Register");
                    return null;
                }

                const bytes: number[] = [];
                for (let k = 0; k < size; k++) {
                    const w = words[i + k];
                    bytes.push(w >> 8, w & 0xff);
                }
                value = Buffer.from(bytes).toString("ascii").replace(/\0+$/, "");
            }
            /* Fallback = ham 16-bit */
            else {
                backendLogger.warning(`Unknown data type: ${this.dataType}, using raw 16-bit value`, "Register");
                value = (words[i] + this.offset) * scale;
            }
        } catch (err: any) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            backendLogger.error(`Decode error (${this.id}, ${this.dataType}): ${errorMessage}`, "Register");
            return null;
        }

        // Sayısal değerleri iki ondalığa yuvarla
        if (typeof value === "number" && !isNaN(value)) {
            value = Number(value.toFixed(2));
        }

        // Değerleri kaydet
        this.value = value;
        this.lastUpdated = Date.now();
        this.missCount = 0;
        return value;
    }

    /**
     * Register okuma hatası durumunda miss sayacını artırır
     */
    incrementMiss(): number {
        this.missCount += 1;
        return this.missCount;
    }

    /**
     * Miss sayacını sıfırlar
     */
    resetMiss(): void {
        this.missCount = 0;
    }

    /**
     * Register'ın okunmasını atlamalı mı kontrolü
     * Otomatik iyileşme: 40 miss'ten sonra her 10 dakikada bir test eder
     */
    shouldSkip(): boolean {
        if (this.missCount >= MAX_MISS) {
            // Otomatik iyileşme: Her 10 dakikada bir test et
            const retestInterval = 10 * 60 * 1000; // 10 dakika
            const currentTime = Date.now();
            
            if (!this.lastTestTime || (currentTime - this.lastTestTime) >= retestInterval) {
                this.lastTestTime = currentTime;
                backendLogger.info(`Automatic recovery test: ${this.id} (miss: ${this.missCount})`, "Register");
                return false; // Bu sefer test et
            }
            
            return true; // Normal durumda atla
        }
        
        return false; // Miss limiti aşılmamış, normal okuma yap
    }
}