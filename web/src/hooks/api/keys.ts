function workspaceKey(): string {
  return localStorage.getItem('current_workspace_id') || 'default'
}

export function rootKey(scope: string): readonly [string, string] {
  return [scope, workspaceKey()] as const
}
