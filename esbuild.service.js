const esbuild = require('esbuild');
const path = require('path');

// Gerçek native modülleri external olarak belirt
const nativeExternals = [
  'serialport',
  '@serialport/*',
  'bindings',
  'node-gyp-build'
];

// Mevcut externals
const standardExternals = ['express', 'socket.io', 'mongoose'];
// Not: 'mongodb' ve 'modbus-serial' external olarak işaretlenmeyecek, bundle'a dahil edilecek

// Tüm external modülleri birleştir
const allExternals = [...standardExternals, ...nativeExternals];

console.log('Building service with the following externals:');
console.log(allExternals);

esbuild.build({
  entryPoints: ['service_new.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  outfile: 'dist-service/service_bundle.js', // Output dosya adını değiştirdik
  external: allExternals,
  format: 'cjs',
  sourcemap: true,
}).catch(() => process.exit(1));
