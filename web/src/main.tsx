import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './i18n'
import App from './App.tsx'
import { useWorkspaceStore } from './stores/workspace'
import { setupBrandFaviconSync } from './lib/brandIcon'

const theme = localStorage.getItem('theme')
if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
}

setupBrandFaviconSync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

let lastWorkspaceId = useWorkspaceStore.getState().currentWorkspace?.id
useWorkspaceStore.subscribe((state) => {
  const nextId = state.currentWorkspace?.id
  if (nextId !== lastWorkspaceId) {
    lastWorkspaceId = nextId
    queryClient.clear()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
