import {defineConfig} from 'vite';
import {fileURLToPath,URL} from 'node:url';

export default defineConfig({
 base:'./',
 publicDir:false,
 build:{
  outDir:'dist',
  emptyOutDir:false,
  rollupOptions:{input:fileURLToPath(new URL('./handbook-market.html',import.meta.url))},
 },
});
