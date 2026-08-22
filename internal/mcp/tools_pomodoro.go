package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerPomodoroTools() {
	s.registerTool("record_pomodoro", "Record a completed (or stopped) pomodoro focus/break session.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"duration_seconds": map[string]interface{}{"type": "integer", "description": "Session length in seconds"},
			"kind":             map[string]interface{}{"type": "string", "description": "focus or break (default focus)"},
			"todo_id":          map[string]interface{}{"type": "integer", "description": "Optional related todo ID"},
			"completed":        map[string]interface{}{"type": "boolean", "description": "Whether it ran to completion"},
		},
		"required": []string{"duration_seconds"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		p := &model.PomodoroSession{
			DurationSeconds: getArgInt(args, "duration_seconds", 0),
			Kind:            toString(getArg(args, "kind")),
			TodoID:          toUintPtr(getArg(args, "todo_id")),
			Completed:       toString(getArg(args, "completed")) == "true",
		}
		return s.pomodoroSvc.Create(ctx, userID, workspaceID, p)
	})

	s.registerTool("get_pomodoro_summary", "Get today's and all-time focus-session totals.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.pomodoroSvc.Summary(ctx, userID, workspaceID)
	})
}
