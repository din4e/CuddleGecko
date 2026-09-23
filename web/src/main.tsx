import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from './i18n'
import './index.css'
import './i18n'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useWorkspaceStore } from './stores/workspace'
import { useAuthStore } from './stores/auth'
import { setupBrandFaviconSync } from './lib/brandIcon'
import { installUndoRecorder, noteMutationStart, noteMutationSettled } from './lib/undo/recorder'
import { useUndoStore } from './lib/undo/undoStore'

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
    // Undo snapshots: cache-level onMutate runs BEFORE each mutation's own
    // onMutate (optimistic updates), so this is the one pre-edit vantage point.
    onMutate: (variables, mutation) => noteMutationStart(mutation, variables),
    onSettled: (_data, _error, _variables, _context, mutation) => noteMutationSettled(mutation),
    onError: (_error, _variables, _context, mutation) => {
      if (mutation.options.meta?.localErrorHandling) return
      toast.error(i18n.t('common.error'))
    },
  }),
  defaultOptions: {
    queries: {
      // Most lists are invalidated immediately after a mutation. A short cache
      // window makes back-and-forth navigation across subpages feel instant
      // without serving stale local writes.
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

installUndoRecorder(queryClient)

let lastWorkspaceId = useWorkspaceStore.getState().currentWorkspace?.id
useWorkspaceStore.subscribe((state) => {
  const nextId = state.currentWorkspace?.id
  if (nextId !== lastWorkspaceId) {
    lastWorkspaceId = nextId
    queryClient.clear()
    useUndoStore.getState().clear()
  }
})

// Undo history is session state tied to what it describes — drop it on logout.
useAuthStore.subscribe((state, prev) => {
  if (!state.accessToken && prev.accessToken) {
    useUndoStore.getState().clear()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
