/* eslint-disable */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
function copyDirSync(src: string, dest: string) {
  try {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirSync(s, d);
      } else if (entry.isFile()) {
        try {
          const needCopy =
            !fs.existsSync(d) ||
            fs.statSync(d).size !== fs.statSync(s).size;
          if (needCopy) fs.copyFileSync(s, d);
        } catch {
          fs.copyFileSync(s, d);
        }
      }
    }
  } catch (e: any) {
    console.log('[NextWrapper] copyDirSync error:', e && e.message);
  }
}

(function bootstrap() {
  try {
    const standaloneDir =
      process.env.NEXT_STANDALONE_DIR ||
      (require.main && require.main.filename ? path.dirname(require.main.filename) : process.cwd());

    const resourcesPath = process.resourcesPath || process.cwd();
    const runtimeNodeModules = path.join(resourcesPath, 'runtime', 'node_modules');
    const localNodeModules = path.join(standaloneDir, 'node_modules');

    const parts = [];
    if (process.env.NODE_PATH) parts.push(process.env.NODE_PATH);
    parts.push(localNodeModules);
    parts.push(runtimeNodeModules);
    process.env.NODE_PATH = parts.filter(Boolean).join(path.delimiter);

    Module._initPaths();
  } catch (e) {
    // En iyi çaba: bootstrap hatası uygulamayı durdurmasın
  }
})();

(function startServer() {
  const resourcesPath = process.resourcesPath || process.cwd();
  const appDir = path.join(resourcesPath, 'app');
  const nextDir = path.join(appDir, '.next');
  const serverPath = path.join(nextDir, 'server.js');

  if (!process.env.PORT) process.env.PORT = '3000';

  try {
    const destStaticDir = path.join(nextDir, 'static');
    const srcStaticDir = path.join(appDir, 'static');
    console.log('[NextWrapper] resourcesPath:', resourcesPath);
    console.log('[NextWrapper] appDir:', appDir);
    console.log('[NextWrapper] nextDir:', nextDir);
    console.log('[NextWrapper] serverPath:', serverPath);
    console.log('[NextWrapper] exists(destStaticDir):', fs.existsSync(destStaticDir), '->', destStaticDir);
    console.log('[NextWrapper] exists(srcStaticDir):', fs.existsSync(srcStaticDir), '->', srcStaticDir);

    // Static dosyaları daha agresif şekilde kopyala - her zaman kopyala
    try {
      if (fs.existsSync(srcStaticDir)) {
        console.log('[NextWrapper] syncing static from parent to standalone/.next/static');
        copyDirSync(srcStaticDir, destStaticDir);
        console.log('[NextWrapper] sync completed. exists(dest):', fs.existsSync(destStaticDir));
      } else {
        // Alternatif static kaynak ara
        const altStaticDir = path.join(resourcesPath, 'app', 'static');
        if (fs.existsSync(altStaticDir)) {
          console.log('[NextWrapper] syncing static from alternative location:', altStaticDir);
          copyDirSync(altStaticDir, destStaticDir);
        }
      }
    } catch (e) {
      console.error('[NextWrapper] Error copying static files:', e);
    }
  } catch (e: any) {
    console.log('[NextWrapper] static sync error:', e && e.message);
  }

  require(serverPath);
})();

// Stdout'u buffer etmeden direkt iletmek için
const originalWrite = process.stdout.write;
process.stdout.write = function (chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error | null) => void), callback?: (err?: Error | null) => void) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = undefined;
  }
  return originalWrite.call(process.stdout, chunk, encoding as BufferEncoding, callback);
};
