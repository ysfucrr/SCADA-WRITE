
import { Register } from "./Register";

/**
 * PollerBlock sınıfı - Birbirine yakın registerleri gruplayarak toplu okumayı sağlar
 */
export class PollerBlock {
    start: number;
    qty: number;
    registers: Register[];

    constructor(start: number, qty: number, registers: Register[] = []) {
        this.start = start;
        this.qty = qty;
        this.registers = registers;
    }

    /**
     * Blok içindeki tüm register'ların atlanması gerekip gerekmediğini kontrol eder
     */
    shouldSkip(): boolean {
        return this.registers.length > 0 && this.registers.every(reg => reg.shouldSkip());
    }

    /**
     * Blok içindeki register'ları decode eder
     */
    decodeRegisters(words: number[]): void {
        // Her register için detaylı log ekleyerek decode işlemi yap
        this.registers.forEach((register) => {
            try {
                // Decode edilen değeri register'a ata
                const value = register.decode(words, this.start);
                
                // Değer atanıp atanmadığını kontrol et
                if (value !== null && value !== undefined) {
                    register.value = value;
                    register.lastUpdated = Date.now(); // Timestamp olarak kaydediyoruz
                }
            } catch (err: any) {
                console.error(`[PollerBlock] Register decode hatası: id=${register.id}, addr=${register.addr}, error=${err.message}`);
            }
        });
    }

    /**
     * Blok içindeki register'ların miss sayacını artırır
     */
    incrementMissForAll(): void {
        this.registers.forEach(register => {
            register.incrementMiss();
        });
    }
}