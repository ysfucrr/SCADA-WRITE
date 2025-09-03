import type { NextConfig } from "next";
import path from 'path';
import WebpackObfuscator from 'webpack-obfuscator';
const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  compiler: {
    // Production build'te console.* kaldırılır. Hata ve uyarıları koruyoruz.
    removeConsole: { exclude: ['error', 'warn'] },
  },
  // async rewrites() {
  //   return [
  //     {
  //       source: '/uploads/:path*',
  //       destination: '/uploads/:path*',
  //     },
  //   ];
  // },
  webpack(config, { dev, isServer }) {
    config.resolve.alias['@uploads'] = path.resolve(__dirname, 'uploads');
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    
    // Production build'de obfuscation uygula
    if (!dev && !isServer) {
      console.log('Applying code obfuscation for client-side production build...');
      config.plugins.push(
        new WebpackObfuscator({
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
          unicodeEscapeSequence: true
        }, [
          // Exclude patterns for files that should not be obfuscated
          // For example third-party libraries or specific files
          '**/*.min.js',
          '**/node_modules/**',
          // Avoid obfuscating Next runtime/core chunks
          '**/webpack-*.js',
          '**/framework-*.js',
          '**/main-*.js',
          '**/polyfills-*.js'
        ])
      );
    }
    
    return config;
  },
  // CORS sorunu için dev origin'leri açıkca belirt
  // allowedDevOrigins: ['http://localhost:3000', 'http://95.216.5.145:3000', 'http://localhost:3001', 'http://95.216.5.145:3001', '*'],
};


export default nextConfig;
