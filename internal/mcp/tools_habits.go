package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerHabitTools() {
	s.registerTool("list_habits", "List habit trackers with today's check-in, streak, best, and 30-day rate.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"archived": map[string]interface{}{"type": "boolean", "description": "Include archived habits"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		include := toString(getArg(args, "archived")) == "true"
		return s.habitSvc.List(ctx, userID, workspaceID, include)
	})

	s.registerTool("create_habit", "Create a daily habit tracker.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name":      map[string]interface{}{"type": "string", "description": "Habit name"},
			"color":     map[string]interface{}{"type": "string", "description": "Habit color"},
			"emoji":     map[string]interface{}{"type": "string", "description": "Habit emoji"},
			"sort_order": map[string]interface{}{"type": "integer", "description": "Sort order"},
		},
		"required": []string{"name"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		h := &model.Habit{
			Name:      toString(getArg(args, "name")),
			Color:     toString(getArg(args, "color")),
			Emoji:     toString(getArg(args, "emoji")),
			SortOrder: getArgInt(args, "sort_order", 0),
		}
		return s.habitSvc.Create(ctx, userID, workspaceID, h)
	})

	s.registerTool("checkin_habit", "Toggle a habit check-in for a date (YYYY-MM-DD; default today).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":   map[string]interface{}{"type": "integer", "description": "Habit ID"},
			"date": map[string]interface{}{"type": "string", "description": "Date YYYY-MM-DD (default today)"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		checked, err := s.habitSvc.Toggle(ctx, userID, workspaceID, id, toString(getArg(args, "date")))
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"checked": checked}, nil
	})

	s.registerTool("delete_habit", "Delete a habit tracker and its check-in history.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Habit ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		if err := s.habitSvc.Delete(ctx, userID, workspaceID, id); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil
	})
}
