import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cat: resolve(__dirname, 'src/renderer/cat/index.html'),
        settings: resolve(__dirname, 'src/renderer/settings/index.html')
      }
    }
  }
});
