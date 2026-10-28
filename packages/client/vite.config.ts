import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In Docker the dev server runs in its own container, so `localhost:3001` would
// point at itself. compose.dev.yaml sets VITE_PROXY_TARGET=http://api:3001.
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // required inside a container; 127.0.0.1 would not be reachable
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
