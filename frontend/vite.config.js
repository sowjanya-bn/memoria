import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/suggestions': 'http://localhost:8765',
      '/scene': 'http://localhost:8765',
      '/search': 'http://localhost:8765',
      '/expand': 'http://localhost:8765',
      '/entity': 'http://localhost:8765',
    },
  },
})
