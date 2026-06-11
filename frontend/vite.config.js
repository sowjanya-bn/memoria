import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@cosmograph/cosmograph', '@cosmograph/react'],
  },
  resolve: {
    alias: {
      // gl-bench main field is CJS; point to the ESM module build instead
      'gl-bench': '/Users/sowjanya/code/memoria/frontend/node_modules/gl-bench/dist/gl-bench.module.js',
    },
  },
  server: {
    proxy: {
      '/suggestions': 'http://localhost:8765',
      '/scene': 'http://localhost:8765',
      '/search': 'http://localhost:8765',
      '/expand': 'http://localhost:8765',
      '/entity': 'http://localhost:8765',
      '/neighbours': 'http://localhost:8765',
      '/types': 'http://localhost:8765',
    },
  },
})
