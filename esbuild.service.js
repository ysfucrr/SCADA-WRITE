const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['service_new.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  outfile: 'dist-service/service_new.js',
  external: ['express', 'socket.io', 'mongodb', 'mongoose'],
  format: 'cjs',
  sourcemap: true,
}).catch(() => process.exit(1));
