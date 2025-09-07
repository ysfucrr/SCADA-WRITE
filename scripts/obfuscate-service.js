const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const files = process.argv.slice(2);
const outDir = path.resolve(__dirname, '..', 'dist-service');

if (files.length === 0) {
  console.error('No files provided. Usage: node scripts/obfuscate-service.js <file1.js> <file2.js> ...');
  process.exit(1);
}

// Şifrelenmemesi gereken dosya isim ve içerik kontrolleri
const shouldSkipObfuscation = (filePath) => {
  try {
    // Path kontrolü - en hızlı
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Dizin kontrolü - tüm modbus ve serial klasörlerini koru
    if (normalizedPath.includes('/modbus/') ||
        normalizedPath.includes('/serial/') ||
        normalizedPath.includes('/node_modules/modbus-') ||
        normalizedPath.includes('/node_modules/serialport')) {
      console.log(`Skipping obfuscation based on directory path: ${normalizedPath}`);
      return true;
    }
    
    // Dosya adı kontrolü
    const fileName = path.basename(filePath);
    
    // Belirli dosyaları doğrudan atla
    if (fileName.includes('Serial') ||
        fileName.includes('serial') ||
        fileName.includes('Modbus') ||
        fileName.includes('modbus')) {
      console.log(`Skipping obfuscation based on filename: ${fileName}`);
      return true;
    }
    
    // Dosya içeriğini oku
    console.log(`Checking file content for native module imports: ${fileName}`);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Native modül importları içeriyor mu?
    const hasNativeImports = content.includes('serialport') ||
                             content.includes('@serialport') ||
                             content.includes('modbus') ||
                             content.includes('ModbusRTU') ||
                             content.includes('SerialPort') ||
                             content.includes('bindings') ||
                             content.includes('node-gyp-build');
    
    // SerialPort ve Modbus ilgili sınıf adlarını içeriyor mu?
    const hasModbusSerialClasses = content.includes('SerialPoller') ||
                                  content.includes('ModbusSerialConnection') ||
                                  content.includes('SerialConnection') ||
                                  content.includes('ModbusConnection') ||
                                  content.includes('RTU') ||
                                  content.includes('readHoldingRegisters') ||
                                  content.includes('writeRegister');
    
    // Modül resolver içeriyor mu?
    const hasModuleResolver = content.includes('resolveSerialModulePath') ||
                              content.includes('module.paths') ||
                              content.includes('require(') || // Native modül require edebilecek dosyalar
                              content.includes('dynamically') || // Dinamik import/require içerebilir
                              content.includes('constructor.prototype');
    
    // Herhangi bir eşleşme varsa obfuscation'ı atla
    if (hasNativeImports) {
      console.log(`Native module imports found in ${fileName}`);
      return true;
    }
    
    if (hasModbusSerialClasses) {
      console.log(`Modbus or Serial classes found in ${fileName}`);
      return true;
    }
    
    if (hasModuleResolver) {
      console.log(`Module resolver found in ${fileName}`);
      return true;
    }
    
    return false;
  } catch (err) {
    console.error(`Error checking file ${filePath}:`, err);
    // Hata durumunda güvenli tarafta kal, şifreleme
    return false;
  }
};

const options = {
  rotateStringArray: true,
  stringArray: true,
  stringArrayEncoding: ['none'],
  stringArrayThreshold: 0.75,
  identifierNamesGenerator: 'hexadecimal',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  disableConsoleOutput: true,
  transformObjectKeys: true,
  unicodeEscapeSequence: true,
  target: 'node',
};

for (const file of files) {
  const filePath = path.join(outDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    continue;
  }
  
  // Dosyayı şifreleme kararı
  if (shouldSkipObfuscation(filePath)) {
    console.log(`Skipped obfuscation for native module file: ${path.basename(filePath)}`);
  } else {
    const code = fs.readFileSync(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, options);
    fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
    console.log(`Obfuscated: ${filePath}`);
  }
}
