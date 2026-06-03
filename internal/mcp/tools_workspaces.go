package mcp

import (
	"context"
)

func (s *MCPServer) registerWorkspaceTools() {
	s.registerTool("list_workspaces", "List all workspaces for the current user.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		// workspaceSvc.List does NOT take workspaceID
		return s.workspaceSvc.List(ctx, userID)
	})

	s.registerTool("switch_workspace", "Switch to a different workspace.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"workspace_id": map[string]interface{}{"type": "integer", "description": "Workspace ID to switch to"},
		},
		"required": []string{"workspace_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		targetID := toUint(getArg(args, "workspace_id"))
		return s.workspaceSvc.Switch(ctx, userID, targetID)
	})
}
