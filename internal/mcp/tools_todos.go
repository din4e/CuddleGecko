package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerTodoTools() {
	s.registerTool("list_todos", "List todos with optional filters.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"status":   map[string]interface{}{"type": "string", "description": "Filter by status: pending or done"},
			"list_id":  map[string]interface{}{"type": "integer", "description": "Filter by list ID (0 = Inbox)"},
			"tag_ids":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Filter by tag IDs"},
			"overdue":  map[string]interface{}{"type": "boolean", "description": "Only overdue pending todos"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		var status *string
		if v := getArg(args, "status"); v != nil {
			st := toString(v)
			status = &st
		}
		var listID *uint
		if v := getArg(args, "list_id"); v != nil {
			id := toUint(v)
			listID = &id
		}
		overdue := false
		if v := getArg(args, "overdue"); v != nil {
			overdue = toString(v) == "true"
		}
		todos, _, err := s.todoSvc.List(ctx, userID, workspaceID, status, listID, toUintSlice(getArg(args, "tag_ids")), overdue, 1, 200)
		return todos, err
	})

	s.registerTool("create_todo", "Create a new todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title":        map[string]interface{}{"type": "string", "description": "Todo title"},
			"description":  map[string]interface{}{"type": "string", "description": "Todo description (Markdown)"},
			"status":       map[string]interface{}{"type": "string", "description": "Status: pending or done (default pending)"},
			"priority":     map[string]interface{}{"type": "string", "description": "Priority: low, normal, high (default normal)"},
			"due_time":     map[string]interface{}{"type": "string", "description": "Due time (RFC3339)"},
			"amount":       map[string]interface{}{"type": "number", "description": "Associated amount"},
			"amount_type":  map[string]interface{}{"type": "string", "description": "Amount type: income or expense"},
			"contact_ids":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":        map[string]interface{}{"type": "string", "description": "Todo color"},
			"list_id":      map[string]interface{}{"type": "integer", "description": "List ID this todo belongs to"},
			"repeat_rule":  map[string]interface{}{"type": "string", "description": "Recurrence: daily, weekly, monthly, yearly, weekdays"},
			"repeat_every": map[string]interface{}{"type": "integer", "description": "Recurrence interval (default 1)"},
			"repeat_until": map[string]interface{}{"type": "string", "description": "Recurrence end date (RFC3339)"},
			"tag_ids":      map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Tag IDs to attach"},
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
			ListID:      toUintPtr(getArg(args, "list_id")),
			RepeatRule:  toString(getArg(args, "repeat_rule")),
			RepeatEvery: getArgInt(args, "repeat_every", 0),
			RepeatUntil: toTimePtr(getArg(args, "repeat_until")),
		}
		created, err := s.todoSvc.Create(ctx, userID, workspaceID, todo)
		if err != nil {
			return nil, err
		}
		if tagIDs := toUintSlice(getArg(args, "tag_ids")); tagIDs != nil {
			_ = s.todoSvc.SetTags(ctx, userID, workspaceID, created.ID, tagIDs)
		}
		return created, nil
	})

	s.registerTool("update_todo", "Update an existing todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":           map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"title":        map[string]interface{}{"type": "string", "description": "Todo title"},
			"description":  map[string]interface{}{"type": "string", "description": "Todo description (Markdown)"},
			"status":       map[string]interface{}{"type": "string", "description": "Status: pending or done"},
			"priority":     map[string]interface{}{"type": "string", "description": "Priority: low, normal, high"},
			"due_time":     map[string]interface{}{"type": "string", "description": "Due time (RFC3339)"},
			"amount":       map[string]interface{}{"type": "number", "description": "Associated amount"},
			"amount_type":  map[string]interface{}{"type": "string", "description": "Amount type: income or expense"},
			"contact_ids":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":        map[string]interface{}{"type": "string", "description": "Todo color"},
			"list_id":      map[string]interface{}{"type": "integer", "description": "List ID this todo belongs to"},
			"repeat_rule":  map[string]interface{}{"type": "string", "description": "Recurrence: daily, weekly, monthly, yearly, weekdays"},
			"repeat_every": map[string]interface{}{"type": "integer", "description": "Recurrence interval"},
			"repeat_until": map[string]interface{}{"type": "string", "description": "Recurrence end date (RFC3339)"},
			"tag_ids":      map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Tag IDs to attach"},
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
			ListID:      toUintPtr(getArg(args, "list_id")),
			RepeatRule:  toString(getArg(args, "repeat_rule")),
			RepeatEvery: getArgInt(args, "repeat_every", 0),
			RepeatUntil: toTimePtr(getArg(args, "repeat_until")),
		}
		updated, err := s.todoSvc.Update(ctx, userID, workspaceID, id, updates)
		if err != nil {
			return nil, err
		}
		if tagIDs := toUintSlice(getArg(args, "tag_ids")); tagIDs != nil {
			_ = s.todoSvc.SetTags(ctx, userID, workspaceID, id, tagIDs)
		}
		return updated, nil
	})

	s.registerTool("toggle_todo", "Toggle a todo between pending and done. Completing a recurring todo spawns the next occurrence.", map[string]interface{}{
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

	s.registerTool("set_todo_tags", "Replace the tags attached to a todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":      map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"tag_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Tag IDs to attach"},
		},
		"required": []string{"id", "tag_ids"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		if err := s.todoSvc.SetTags(ctx, userID, workspaceID, id, toUintSlice(getArg(args, "tag_ids"))); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil
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

func (s *MCPServer) registerTodoListTools() {
	s.registerTool("list_todo_lists", "List all todo lists (projects).", map[string]interface{}{"type": "object", "properties": map[string]interface{}{}}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.todoListSvc.List(ctx, userID, workspaceID)
	})

	s.registerTool("create_todo_list", "Create a todo list (project).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name":      map[string]interface{}{"type": "string", "description": "List name"},
			"color":     map[string]interface{}{"type": "string", "description": "List color"},
			"sort_order": map[string]interface{}{"type": "integer", "description": "Sort order"},
		},
		"required": []string{"name"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		list := &model.TodoList{
			Name:      toString(getArg(args, "name")),
			Color:     toString(getArg(args, "color")),
			SortOrder: getArgInt(args, "sort_order", 0),
		}
		return s.todoListSvc.Create(ctx, userID, workspaceID, list)
	})

	s.registerTool("update_todo_list", "Update a todo list.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":        map[string]interface{}{"type": "integer", "description": "List ID"},
			"name":      map[string]interface{}{"type": "string", "description": "List name"},
			"color":     map[string]interface{}{"type": "string", "description": "List color"},
			"sort_order": map[string]interface{}{"type": "integer", "description": "Sort order"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.TodoList{
			Name:      toString(getArg(args, "name")),
			Color:     toString(getArg(args, "color")),
			SortOrder: getArgInt(args, "sort_order", 0),
		}
		return s.todoListSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_todo_list", "Delete a todo list. Its todos are moved back to Inbox.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "List ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		if err := s.todoListSvc.Delete(ctx, userID, workspaceID, id); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil
	})
}

func (s *MCPServer) registerTodoItemTools() {
	s.registerTool("list_todo_items", "List sub-tasks (checklist) of a todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"todo_id": map[string]interface{}{"type": "integer", "description": "Parent todo ID"},
		},
		"required": []string{"todo_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		todoID := toUint(getArg(args, "todo_id"))
		return s.todoItemSvc.ListByTodo(ctx, userID, workspaceID, todoID)
	})

	s.registerTool("create_todo_item", "Add a sub-task to a todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"todo_id":    map[string]interface{}{"type": "integer", "description": "Parent todo ID"},
			"title":      map[string]interface{}{"type": "string", "description": "Sub-task title"},
			"sort_order": map[string]interface{}{"type": "integer", "description": "Sort order"},
		},
		"required": []string{"todo_id", "title"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		todoID := toUint(getArg(args, "todo_id"))
		item := &model.TodoItem{
			Title:     toString(getArg(args, "title")),
			SortOrder: getArgInt(args, "sort_order", 0),
		}
		return s.todoItemSvc.Create(ctx, userID, workspaceID, todoID, item)
	})

	s.registerTool("toggle_todo_item", "Toggle a sub-task's done state.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Sub-task ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoItemSvc.Toggle(ctx, userID, workspaceID, id)
	})

	s.registerTool("delete_todo_item", "Delete a sub-task.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Sub-task ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		if err := s.todoItemSvc.Delete(ctx, userID, workspaceID, id); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil
	})
}
