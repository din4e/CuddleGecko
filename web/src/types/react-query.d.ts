import '@tanstack/react-query'

// Extends the mutation meta type so meta: { localErrorHandling: true } type
// checks (consumed by the global MutationCache onError in main.tsx to suppress
// the generic error toast when a call site shows its own specific message).
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      localErrorHandling?: boolean
    }
  }
}
