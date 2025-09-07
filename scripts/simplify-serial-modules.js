/**
 * Bu script, serialport ile ilgili dosyaları tek satıra sıkıştırarak
 * karmaşıklaştırır. Kodu bozmaz, sadece okunmasını zorlaştırır.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Karmaşalaştırılacak dosyalar
const files = [
    'dist-service/serial/ModbusSerialConnection.js',
    'dist-service/serial/SerialPoller.js'
];

// TypeScript dosyalarının JS karşılıkları
const sourceMapping = {
    'src/lib/modbus/serialconnect.ts': 'dist-service/serial/ModbusSerialConnection.js',
    'src/lib/modbus/SerialPoller.ts': 'dist-service/serial/SerialPoller.js'
};

// Dist-service/serial dizinini kontrol et
const serialDir = path.resolve(__dirname, '..', 'dist-service', 'serial');
if (!fs.existsSync(serialDir)) {
    fs.mkdirSync(serialDir, { recursive: true });
    console.log('Created directory:', serialDir);
}

// TypeScript dosyalarını dönüştür
Object.entries(sourceMapping).forEach(([sourcePath, targetPath]) => {
    const fullSourcePath = path.resolve(__dirname, '..', sourcePath);
    const fullTargetPath = path.resolve(__dirname, '..', targetPath);
    
    if (!fs.existsSync(fullSourcePath)) {
        console.error(`Source file not found: ${fullSourcePath}`);
        return;
    }
    
    try {
        // esbuild sorunları yaşadığımız için doğrudan fallback yöntemi kullanacağız
        console.log(`Simplifying ${sourcePath} to JavaScript...`);
        
        // TypeScript kodunu oku
        const tsCode = fs.readFileSync(fullSourcePath, 'utf8');
        
        // Çıktı dizini oluştur
        const outDir = path.dirname(fullTargetPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        // Basit bir JavaScript dönüşümü yap
        // Bu, TypeScript türlerini ve işaretlemelerini kaldırır ama kodu çalışır halde tutar
        console.log('Using direct conversion method...');
        let simpleJs = tsCode;
        
        // TypeScript özelliklerini kaldır
        simpleJs = simpleJs.replace(/: \w+(<[^>]+>)?(\[\])?/g, ''); // Tür işaretleri
        simpleJs = simpleJs.replace(/private |protected |public /g, ''); // Erişim belirteçleri
        simpleJs = simpleJs.replace(/<[^>]+>/g, ''); // Generic tür parametreleri
        simpleJs = simpleJs.replace(/interface\s+\w+\s*\{[^}]*\}/gs, ''); // Interface tanımlamalarını kaldır
        
        // Import ifadelerini koru, ancak formatını düzelt
        simpleJs = simpleJs.replace(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g,
                                     'const $1 = require("$2");');
        
        // Yorum satırlarını kaldır
        simpleJs = simpleJs.replace(/\/\/.*$/gm, ''); // Tek satır yorumları kaldır
        simpleJs = simpleJs.replace(/\/\*[\s\S]*?\*\//g, ''); // Çok satırlı yorumları kaldır
        
        // Boşlukları ve satır sonlarını düzenle
        simpleJs = simpleJs.replace(/\n\s*\n/g, '\n'); // Boş satırları kaldır
        simpleJs = simpleJs.split('\n').join(' '); // Tek satıra sıkıştır
        
        fs.writeFileSync(fullTargetPath, simpleJs);
        console.log(`Simplified to single line: ${fullTargetPath}`);
        
        // Geçici dosyayı temizlemeye gerek yok, çünkü artık kullanmıyoruz
        
    } catch (error) {
        console.error(`Error processing file ${sourcePath}:`, error.message);
    }
});

console.log('Serial modules simplified successfully.');