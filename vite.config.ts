import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Режимы сборки:
 *  - production — для Telegram Mini App (debug вырезан);
 *  - debug — с debug-режимом (`?debug=1`) в dist-debug;
 *  - standalone — один JS-файл со встроенными шрифтами, для автономного HTML
 *    (tools/standalone.ts), открывается двойным кликом без сервера.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __DEBUG__: JSON.stringify(mode !== 'production'),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: mode === 'standalone' ? 100_000_000 : 0,
    cssCodeSplit: mode !== 'standalone',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: mode === 'standalone' ? { output: { codeSplitting: false } } : undefined,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
}));
