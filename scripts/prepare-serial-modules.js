const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Kopyalama işleminin tamamlanması için bekleyen süre (ms)
const COPY_DELAY = 500;

// Native modül listesi
const nativeModules = [
  'serialport',
  '@serialport',
  'modbus-serial',
  'bindings',
  'node-gyp-build'
];

// Hedef dizin
const targetDir = path.resolve(__dirname, '..', 'dist-service', 'serial');

// Dizini temizle/oluştur - emin olmak için bekleme ile
console.log('Cleaning/creating target directory:', targetDir);
if (fs.existsSync(targetDir)) {
  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    // Silme işleminin tamamlanması için küçük bir bekleme
    console.log('Waiting for directory deletion to complete...');
    execSync(`${process.platform === 'win32' ? 'timeout /t 1' : 'sleep 1'}`);
  } catch (err) {
    console.error(`Error cleaning directory: ${err.message}`);
    // Eğer rmSync başarısız olursa, her bir dosyayı tek tek silmeyi dene
    try {
      const deleteFolderRecursive = (dirPath) => {
        if (fs.existsSync(dirPath)) {
          fs.readdirSync(dirPath).forEach(file => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              deleteFolderRecursive(curPath);
            } else {
              try {
                fs.unlinkSync(curPath);
              } catch (e) {
                console.log(`Could not delete file: ${curPath}, error: ${e.message}`);
              }
            }
          });
          fs.rmdirSync(dirPath);
        }
      };
      deleteFolderRecursive(targetDir);
    } catch (deleteErr) {
      console.error(`Failed to clean directory manually: ${deleteErr.message}`);
      // Son çare - klasörü yeniden adlandır
      const backupDir = `${targetDir}_backup_${Date.now()}`;
      try {
        fs.renameSync(targetDir, backupDir);
        console.log(`Renamed existing directory to: ${backupDir}`);
      } catch (renameErr) {
        console.error(`Could not rename directory: ${renameErr.message}`);
        // Devam et, yeni klasör oluşturmayı deneyelim
      }
    }
  }
}

// Yeni dizin oluştur
try {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('Created directory:', targetDir);
} catch (mkdirErr) {
  console.error(`Error creating directory: ${mkdirErr.message}`);
  // Alternatif konum dene
  const altDir = path.resolve(__dirname, '..', `dist-service-serial-${Date.now()}`);
  try {
    fs.mkdirSync(altDir, { recursive: true });
    console.log(`Created alternative directory: ${altDir}`);
    targetDir = altDir; // targetDir değişkenini güncelle
  } catch (altMkdirErr) {
    console.error(`Failed to create alternative directory: ${altMkdirErr.message}`);
    process.exit(1); // Kritik hata - devam edemiyoruz
  }
}

// Node modules dizini
const nodeModulesDir = path.resolve(__dirname, '..', 'node_modules');

// Modülleri kopyala
let totalFiles = 0;
let successfulFiles = 0;
let failedFiles = 0;

for (const moduleName of nativeModules) {
  const sourcePath = path.join(nodeModulesDir, moduleName);
  const targetPath = path.join(targetDir, moduleName);
  
  if (fs.existsSync(sourcePath)) {
    if (moduleName.startsWith('@')) {
      // Scoped modüller için özel işlem (örn. @serialport/*)
      try {
        fs.mkdirSync(targetPath, { recursive: true });
        const submodules = fs.readdirSync(sourcePath);
        for (const submodule of submodules) {
          const subSource = path.join(sourcePath, submodule);
          const subTarget = path.join(targetPath, submodule);
          if (fs.statSync(subSource).isDirectory()) {
            const { total, success } = copyDir(subSource, subTarget);
            totalFiles += total;
            successfulFiles += success;
            failedFiles += (total - success);
          }
        }
      } catch (err) {
        console.error(`Error processing scoped module ${moduleName}: ${err.message}`);
      }
    } else {
      const { total, success } = copyDir(sourcePath, targetPath);
      totalFiles += total;
      successfulFiles += success;
      failedFiles += (total - success);
    }
    console.log(`Processed module: ${moduleName}`);
  } else {
    console.log(`Module not found: ${moduleName}`);
  }
}

// Sonuç özeti
console.log('\nCopy Results:');
console.log(`Total files: ${totalFiles}`);
console.log(`Successfully copied: ${successfulFiles}`);
console.log(`Failed to copy: ${failedFiles}`);

if (failedFiles > 0) {
  console.warn('\nWARNING: Some files could not be copied. This may cause issues with native modules.');
  console.warn('Manual solution: Try copying node_modules/serialport and node_modules/@serialport to dist-service/serial/ manually.');
} else {
  console.log('\nNative modules prepared successfully.');
}

// Geliştirilmiş dizin kopyalama yardımcı fonksiyonu - dosya sayılarını döndürür
function copyDir(src, dest) {
  let totalCount = 0;
  let successCount = 0;

  if (!fs.existsSync(dest)) {
    try {
      fs.mkdirSync(dest, { recursive: true });
    } catch (mkdirErr) {
      console.error(`Cannot create directory ${dest}: ${mkdirErr.message}`);
      return { total: 0, success: 0 };
    }
  }
  
  // Önce normal komut satırı kopyalama dene - hızlıdır
  try {
    if (process.platform === 'win32') {
      execSync(`xcopy "${src}" "${dest}" /E /I /Y`);
      console.log(`Copied ${src} to ${dest} using xcopy`);
      // Tam dosya sayısını bilmiyoruz ama başarılı olduğunu varsay
      return { total: 1, success: 1 };
    } else {
      execSync(`cp -R "${src}/." "${dest}"`);
      console.log(`Copied ${src} to ${dest} using cp`);
      // Tam dosya sayısını bilmiyoruz ama başarılı olduğunu varsay
      return { total: 1, success: 1 };
    }
  } catch (err) {
    console.log(`Command-line copy failed, using manual copy for ${src}: ${err.message}`);
    // Komut başarısız olursa, dosya bazında kopyalama yap
    try {
      const result = copyDirManually(src, dest);
      console.log(`Manually copied ${result.success}/${result.total} files from ${src} to ${dest}`);
      return result;
    } catch (manualErr) {
      console.error(`Both copy methods failed for ${src}: ${manualErr.message}`);
      return { total: 1, success: 0 };
    }
  }
}

// Dosya bazında kopyalama - daha yavaş ama daha güvenilir
function copyDirManually(src, dest) {
  let totalFiles = 0;
  let successFiles = 0;
  
  try {
    // Kaynak dizindeki tüm içeriği oku
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Dosya mı dizin mi kontrol et
      try {
        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          // Alt dizini recursive olarak kopyala
          const subResult = copyDirManually(srcPath, destPath);
          totalFiles += subResult.total;
          successFiles += subResult.success;
        } else {
          // Dosya ise, kopyalamayı dene
          totalFiles++;
          try {
            fs.copyFileSync(srcPath, destPath);
            successFiles++;
          } catch (copyErr) {
            console.error(`Failed to copy file ${srcPath}: ${copyErr.message}`);
            // Hata durumunda devam et, diğer dosyaları da kopyalamaya çalış
          }
        }
      } catch (entryErr) {
        console.error(`Error processing ${srcPath}: ${entryErr.message}`);
      }
    }
  } catch (readErr) {
    console.error(`Failed to read directory ${src}: ${readErr.message}`);
  }
  
  return { total: totalFiles, success: successFiles };
}