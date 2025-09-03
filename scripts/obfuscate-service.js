const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const files = process.argv.slice(2);
const outDir = path.resolve(__dirname, '..', 'dist-service');

if (files.length === 0) {
  console.error('No files provided. Usage: node scripts/obfuscate-service.js <file1.js> <file2.js> ...');
  process.exit(1);
}

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
  const code = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, options);
  fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
  console.log(`Obfuscated: ${filePath}`);
}
