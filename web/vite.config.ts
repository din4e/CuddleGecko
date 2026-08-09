import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import http from 'node:http'

// Reuse a single keep-alive agent so Vite's dev proxy maintains persistent
// connections to the Go backend. Without this, http-proxy opens a fresh TCP
// connection per request, which on Windows triggers a ~200ms delayed-ACK
// stall on roughly every other request.
const backendAgent = new http.Agent({ keepAlive: true, maxSockets: 16 })

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/ws': {
        target: 'ws://localhost:8080',
        changeOrigin: true,
        ws: true,
        // NOTE: no keep-alive agent — the HTTP agent breaks the WS Upgrade.
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        agent: backendAgent,
      },
      '/avatars': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        agent: backendAgent,
      },
    },
  },
})
