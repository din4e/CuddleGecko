import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from './i18n'
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
  // Global safety net: any mutation whose caller doesn't handle the error
  // itself surfaces a toast instead of failing as an unhandled rejection
  // (silent-save bug class found in the form dialogs). Hooks whose call sites
  // show specific messages opt out via meta: { localErrorHandling: true }.
  mutationCache: new MutationCache({
    onError: (_error, _variables, _context, mutation) => {
      if (mutation.options.meta?.localErrorHandling) return
      toast.error(i18n.t('common.error'))
    },
  }),
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
