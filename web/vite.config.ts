import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import http from 'node:http'

// Reuse a single keep-alive agent so Vite's dev proxy maintains persistent
// connections to the Go backend. Without this, http-proxy opens a fresh TCP
// connection per request, which on Windows triggers a ~200ms delayed-ACK
// stall on roughly every other request — turning 3ms API calls into 250ms+.
const backendAgent = new http.Agent({ keepAlive: true, maxSockets: 16 })

const virtualWailsBindingId = '\0virtual:wails-binding'
const virtualWailsRuntimeId = '\0virtual:wails-runtime'

const wailsBindingStub = `
const unavailable = (..._args) => Promise.reject(new Error('Wails binding is not available in web mode'));
export const Register = unavailable;
export const Login = unavailable;
export const Refresh = unavailable;
export const Me = unavailable;
export const Get = (..._args) => Promise.resolve({ enabled: false });
export const List = unavailable;
export const Create = unavailable;
export const GetByID = unavailable;
export const Update = unavailable;
export const Delete = unavailable;
export const GetTags = unavailable;
export const ReplaceTags = unavailable;
export const ListByContact = unavailable;
export const GetGraph = unavailable;
export const GetRelations = unavailable;
export const CreateRelation = unavailable;
export const DeleteRelation = unavailable;
export const ExportJSON = unavailable;
export const ImportJSON = unavailable;
export const Summary = unavailable;
export const ListProviders = unavailable;
export const SaveProvider = unavailable;
export const ActivateProvider = unavailable;
export const TestConnection = unavailable;
export const ListConversations = unavailable;
export const CreateConversation = unavailable;
export const GetMessages = unavailable;
export const DeleteConversation = unavailable;
export const Chat = unavailable;
export const AnalyzeRelationship = unavailable;
export const AnalyzeEvent = unavailable;
export const ListPresets = unavailable;
export const Version = () => Promise.resolve('0.1.0');
export const Platform = () => Promise.resolve('web');
export const Arch = () => Promise.resolve('');
export const DataDir = () => Promise.resolve('');
export const DatabasePath = () => Promise.resolve('');
export const OpenDataDir = unavailable;
export const Switch = unavailable;
export const GetDefault = unavailable;
`

const wailsRuntimeStub = `
const unavailable = (..._args) => Promise.reject(new Error('Wails runtime is not available in web mode'));
export const EventsOn = () => () => {};
export const WindowMinimise = unavailable;
export const WindowToggleMaximise = unavailable;
export const WindowClose = unavailable;
export const WindowIsMaximised = () => Promise.resolve(false);
export const WindowUnmaximise = unavailable;
export const Quit = unavailable;
`

const isWailsBindingId = (id: string) =>
  id.startsWith('@/wailsjs/go/bindings/') ||
  id.startsWith('src/wailsjs/go/bindings/') ||
  id.startsWith('/src/wailsjs/go/bindings/') ||
  id.includes('/src/wailsjs/go/bindings/')

const isWailsRuntimeId = (id: string) =>
  id === '@/wailsjs/runtime/runtime' ||
  id === 'src/wailsjs/runtime/runtime' ||
  id === '/src/wailsjs/runtime/runtime' ||
  id.endsWith('/src/wailsjs/runtime/runtime')

export default defineConfig({
  plugins: [
    {
      name: 'web-wails-stubs',
      enforce: 'pre',
      resolveId(id) {
        if (isWailsBindingId(id)) return virtualWailsBindingId
        if (isWailsRuntimeId(id)) return virtualWailsRuntimeId
      },
      load(id) {
        if (id === virtualWailsBindingId) return wailsBindingStub
        if (id === virtualWailsRuntimeId) return wailsRuntimeStub
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
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
