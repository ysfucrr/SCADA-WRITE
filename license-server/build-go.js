const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('License Server derleniyor...');

// Geçerli dizin
const currentDir = __dirname;
const outputExe = path.join(currentDir, 'license-server.exe');

try {
  // Go yüklü mü kontrol et
  try {
    execSync('go version', { stdio: 'pipe' });
  } catch (error) {
    console.error('HATA: Go kurulu değil! Lütfen https://golang.org/dl/ adresinden Go\'yu indirip kurun.');
    process.exit(1);
  }

  // Go modülünü başlat (eğer zaten başlatılmamışsa)
  if (!fs.existsSync(path.join(currentDir, 'go.mod'))) {
    console.log('Go modülü başlatılıyor...');
    execSync('go mod init license-server', { cwd: currentDir, stdio: 'inherit' });
  }

  // Bağımlılıkları getir
  console.log('Bağımlılıklar yükleniyor...');
  execSync('go mod tidy', { cwd: currentDir, stdio: 'inherit' });

  // Windows için derle
  console.log('Windows için derleniyor...');
  execSync('go build -o license-server.exe -ldflags="-s -w" main.go', { 
    cwd: currentDir, 
    stdio: 'inherit',
    env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64' }
  });

  console.log(`Derleme tamamlandı: ${outputExe}`);

} catch (error) {
  console.error('Derleme hatası:', error);
  process.exit(1);
}