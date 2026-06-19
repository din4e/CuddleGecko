export type CommandArgs = Record<string, unknown>
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
