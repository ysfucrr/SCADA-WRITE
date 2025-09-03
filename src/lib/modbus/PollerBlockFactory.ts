import { PollerBlock } from "./PollerBlock";
import { Register } from "./Register";


const MAX_GAP_WORDS = 1;

/**
 * PollerBlockFactory - RegisterConfig dizisinden PollerBlock nesneleri oluşturur
 */
export class PollerBlockFactory {
    /**
     * Register'ları yakın mesafeli bloklara ayırır
     */
    static makeBlocks(registers: Register[]): PollerBlock[] {
        if (!Array.isArray(registers) || registers.length === 0) {
            return [];
        }

        // Aynı adresli tüm register'ları (farklı bitler dahil) aynı block'ta grupla
        const addrMap = new Map<number, Register[]>();
        for (const reg of registers) {
            if (!addrMap.has(reg.addr)) {
                addrMap.set(reg.addr, []);
            }
            addrMap.get(reg.addr)!.push(reg);
        }

        const sortedAddrs = Array.from(addrMap.keys()).sort((a, b) => a - b);
        const blocks: PollerBlock[] = [];
        let currentBlock: PollerBlock | null = null;

        for (const addr of sortedAddrs) {
            const regsAtAddr = addrMap.get(addr)!;
            // Her bir addr için, o adresteki tüm register'ları aynı anda block'a ekle
            // span, o adresteki en büyük register'ın span'ı kadar olmalı
            const maxSpan = Math.max(...regsAtAddr.map(register => {
                switch (register.dataType) {
                    case "boolean":
                        // For boolean, span depends on the bit number to read up to 64 bits.
                        // e.g., bit 30 needs 2 registers (0-15, 16-31). bit 63 needs 4 registers.
                        return Math.floor((register.bit || 0) / 16) + 1;
                    case "int8":
                    case "uint8":
                    case "int16":
                    case "uint16":
                        return 1;
                    case "int32":
                    case "uint32":
                    case "float32":
                        return 2;
                    case "int64":
                    case "uint64":
                    case "float64":
                        return 4;
                    case "string":
                        return Math.max(1, Number(register.size) || 1);
                    default:
                        return 1;
                }
            }));

            const endAddr = addr + maxSpan - 1;

            if (!currentBlock) {
                currentBlock = new PollerBlock(addr, maxSpan, [...regsAtAddr]);
            } else if (addr <= currentBlock.start + currentBlock.qty + MAX_GAP_WORDS) {
                currentBlock.qty = Math.max(currentBlock.qty, endAddr - currentBlock.start + 1);
                currentBlock.registers.push(...regsAtAddr);
            } else {
                blocks.push(currentBlock);
                currentBlock = new PollerBlock(addr, maxSpan, [...regsAtAddr]);
            }
        }

        if (currentBlock) {
            blocks.push(currentBlock);
        }

        return blocks;
    }
}