import type { NextConfig } from "next";
import path from 'path';
import WebpackObfuscator from 'webpack-obfuscator';
const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Electron içinde çalışırken public path ayarı
  assetPrefix: process.env.NODE_ENV === 'production' ? '/' : '',
  // Chunk'ları daha büyük gruplar halinde birleştir ve sayılarını azalt
  webpack: (config, { dev, isServer }) => {
    // Optimizasyon ayarları
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 0,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        cacheGroups: {
          defaultVendors: {
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            reuseExistingChunk: true,
          },
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
          // Özel kütüphaneler için gruplar oluştur
          charts: {
            test: /[\\/]node_modules[\\/](apexcharts|react-apexcharts)/,
            name: 'charts-vendor',
            chunks: 'all',
            priority: 10,
          },
          xlsx: {
            test: /[\\/]node_modules[\\/](xlsx)/,
            name: 'xlsx-vendor',
            chunks: 'all',
            priority: 10,
          },
        },
      };
    }

    // Alias tanımlamaları
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
          '**/*.min.js',
          '**/node_modules/**',
          // Avoid obfuscating Next runtime/core chunks
          '**/webpack-*.js',
          '**/framework-*.js',
          '**/main-*.js',
          '**/polyfills-*.js',
          '**/chunks/**', // Tüm chunk'ları obfuscation'dan hariç tut
          '**/*.chunk.js'
        ])
      );
    }
    
    return config;
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
  // CORS sorunu için dev origin'leri açıkca belirt
  // allowedDevOrigins: ['http://localhost:3000', 'http://95.216.5.145:3000', 'http://localhost:3001', 'http://95.216.5.145:3001', '*'],
};


export default nextConfig;

