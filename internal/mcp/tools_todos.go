package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerTodoTools() {
	s.registerTool("list_todos", "List todos with optional status filter.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"status": map[string]interface{}{"type": "string", "description": "Filter by status: pending or done"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		var status *string
		if v := getArg(args, "status"); v != nil {
			s := toString(v)
			status = &s
		}
		return s.todoSvc.List(ctx, userID, workspaceID, status)
	})

	s.registerTool("create_todo", "Create a new todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title":        map[string]interface{}{"type": "string", "description": "Todo title"},
			"description":  map[string]interface{}{"type": "string", "description": "Todo description"},
			"status":       map[string]interface{}{"type": "string", "description": "Status: pending or done (default pending)"},
			"priority":     map[string]interface{}{"type": "string", "description": "Priority: low, normal, high (default normal)"},
			"due_time":     map[string]interface{}{"type": "string", "description": "Due time (RFC3339)"},
			"amount":       map[string]interface{}{"type": "number", "description": "Associated amount"},
			"amount_type":  map[string]interface{}{"type": "string", "description": "Amount type: income or expense"},
			"contact_ids":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":        map[string]interface{}{"type": "string", "description": "Todo color"},
		},
		"required": []string{"title"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		todo := &model.Todo{
			Title:       toString(getArg(args, "title")),
			Description: toString(getArg(args, "description")),
			Status:      toString(getArg(args, "status")),
			Priority:    toString(getArg(args, "priority")),
			DueTime:     toTimePtr(getArg(args, "due_time")),
			Amount:      toFloat64Ptr(getArg(args, "amount")),
			AmountType:  toString(getArg(args, "amount_type")),
			ContactIDs:  toUintSlice(getArg(args, "contact_ids")),
			Color:       toString(getArg(args, "color")),
		}
		return s.todoSvc.Create(ctx, userID, workspaceID, todo)
	})

	s.registerTool("update_todo", "Update an existing todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":           map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"title":        map[string]interface{}{"type": "string", "description": "Todo title"},
			"description":  map[string]interface{}{"type": "string", "description": "Todo description"},
			"status":       map[string]interface{}{"type": "string", "description": "Status: pending or done"},
			"priority":     map[string]interface{}{"type": "string", "description": "Priority: low, normal, high"},
			"due_time":     map[string]interface{}{"type": "string", "description": "Due time (RFC3339)"},
			"amount":       map[string]interface{}{"type": "number", "description": "Associated amount"},
			"amount_type":  map[string]interface{}{"type": "string", "description": "Amount type: income or expense"},
			"contact_ids":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":        map[string]interface{}{"type": "string", "description": "Todo color"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Todo{
			Title:       toString(getArg(args, "title")),
			Description: toString(getArg(args, "description")),
			Status:      toString(getArg(args, "status")),
			Priority:    toString(getArg(args, "priority")),
			DueTime:     toTimePtr(getArg(args, "due_time")),
			Amount:      toFloat64Ptr(getArg(args, "amount")),
			AmountType:  toString(getArg(args, "amount_type")),
			ContactIDs:  toUintSlice(getArg(args, "contact_ids")),
			Color:       toString(getArg(args, "color")),
		}
		return s.todoSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("toggle_todo", "Toggle a todo between pending and done.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.ToggleStatus(ctx, userID, workspaceID, id)
	})

	s.registerTool("sync_todo_to_event", "Sync a todo to create a corresponding event.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.SyncToEvent(ctx, userID, workspaceID, id)
	})

	s.registerTool("delete_todo", "Delete a todo by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.todoSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "todo deleted"}, nil
	})
}
