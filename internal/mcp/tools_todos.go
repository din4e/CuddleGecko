package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

func (s *MCPServer) registerTodoTools() {
	s.registerTool("list_todos", "List todos with optional filters (status, priority, search, sort).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"status":   map[string]interface{}{"type": "string", "description": "Filter by status: pending, done or abandoned"},
			"priority": map[string]interface{}{"type": "string", "description": "Filter by priority: none, low, normal or high"},
			"q":        map[string]interface{}{"type": "string", "description": "Case-insensitive substring match on title"},
			"sort":     map[string]interface{}{"type": "string", "description": "Sort key: due_date (default), priority, title or created"},
			"order":    map[string]interface{}{"type": "string", "description": "Sort order: asc (default) or desc"},
			"overdue":  map[string]interface{}{"type": "boolean", "description": "Only pending todos whose due time is in the past"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		q := model.TodoListQuery{
			Status:   toString(getArg(args, "status")),
			Priority: toString(getArg(args, "priority")),
			Search:   toString(getArg(args, "q")),
			Sort:     toString(getArg(args, "sort")),
			Order:    toString(getArg(args, "order")),
			Page:     1,
			PageSize: 200,
		}
		if v := getArg(args, "overdue"); v != nil {
			q.Overdue = toBool(v)
		}
		todos, _, err := s.todoSvc.List(ctx, userID, workspaceID, q)
		return todos, err
	})

	s.registerTool("create_todo", "Create a new todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title":        map[string]interface{}{"type": "string", "description": "Todo title"},
			"description":  map[string]interface{}{"type": "string", "description": "Todo description"},
			"status":       map[string]interface{}{"type": "string", "description": "Status: pending, done or abandoned (default pending)"},
			"priority":     map[string]interface{}{"type": "string", "description": "Priority: none, low, normal or high (default normal)"},
			"due_time":     map[string]interface{}{"type": "string", "description": "Due time (RFC3339)"},
			"amount":       map[string]interface{}{"type": "number", "description": "Associated amount"},
			"amount_type":  map[string]interface{}{"type": "string", "description": "Amount type: income or expense"},
			"contact_ids":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":        map[string]interface{}{"type": "string", "description": "Todo color"},
			"repeat":       map[string]interface{}{"type": "string", "description": "Recurrence: daily, weekly, weekdays, monthly or yearly (empty to disable)"},
			"parent_id":    map[string]interface{}{"type": "integer", "description": "Parent todo ID to nest under (omit/0 for top level)"},
		},
		"required": []string{"title"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		var parentID *uint
		if v := getArg(args, "parent_id"); v != nil {
			if u := toUint(v); u != 0 {
				parentID = &u
			}
		}
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
			Repeat:      toString(getArg(args, "repeat")),
			ParentID:    parentID,
		}
		return s.todoSvc.Create(ctx, userID, workspaceID, todo)
	})

	s.registerTool("update_todo", "Update an existing todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":             map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"title":          map[string]interface{}{"type": "string", "description": "Todo title"},
			"description":    map[string]interface{}{"type": "string", "description": "Todo description"},
			"status":         map[string]interface{}{"type": "string", "description": "Status: pending, done or abandoned"},
			"priority":       map[string]interface{}{"type": "string", "description": "Priority: none, low, normal or high"},
			"due_time":       map[string]interface{}{"type": "string", "description": "Due time (RFC3339)"},
			"clear_due_time": map[string]interface{}{"type": "boolean", "description": "Clear the due time"},
			"amount":         map[string]interface{}{"type": "number", "description": "Associated amount"},
			"clear_amount":   map[string]interface{}{"type": "boolean", "description": "Clear the associated amount"},
			"amount_type":    map[string]interface{}{"type": "string", "description": "Amount type: income or expense"},
			"contact_ids":    map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":          map[string]interface{}{"type": "string", "description": "Todo color"},
			"repeat":         map[string]interface{}{"type": "string", "description": "Recurrence: daily, weekly, weekdays, monthly or yearly (empty to disable)"},
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
			Repeat:      toString(getArg(args, "repeat")),
		}
		clear := service.TodoClear{
			DueTime: toBool(getArg(args, "clear_due_time")),
			Amount:  toBool(getArg(args, "clear_amount")),
		}
		return s.todoSvc.Update(ctx, userID, workspaceID, id, updates, clear)
	})

	s.registerTool("toggle_todo", "Toggle a todo between pending and done (a closed task — done or abandoned — returns to pending).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.ToggleStatus(ctx, userID, workspaceID, id)
	})

	s.registerTool("set_todo_status", "Set a todo's status explicitly (pending, done or abandoned). Unlike toggle_todo this never advances recurring tasks.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":     map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"status": map[string]interface{}{"type": "string", "description": "New status: pending, done or abandoned"},
		},
		"required": []string{"id", "status"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.SetStatus(ctx, userID, workspaceID, id, toString(getArg(args, "status")))
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

	// --- Checklist (subtask) tools ---

	s.registerTool("list_todo_items", "List the checklist (subtask) items of a todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.ListItems(ctx, userID, workspaceID, id)
	})

	s.registerTool("create_todo_item", "Add a checklist (subtask) item to a todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":      map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"content": map[string]interface{}{"type": "string", "description": "Item content"},
		},
		"required": []string{"id", "content"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.CreateItem(ctx, userID, workspaceID, id, toString(getArg(args, "content")))
	})

	s.registerTool("update_todo_item", "Update a checklist item's content and/or due time.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":             map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"item_id":        map[string]interface{}{"type": "integer", "description": "Todo item ID"},
			"content":        map[string]interface{}{"type": "string", "description": "New item content"},
			"due_time":       map[string]interface{}{"type": "string", "description": "Item due time (RFC3339)"},
			"clear_due_time": map[string]interface{}{"type": "boolean", "description": "Clear the item's due time"},
		},
		"required": []string{"id", "item_id", "content"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		itemID := toUint(getArg(args, "item_id"))
		return s.todoSvc.UpdateItem(ctx, userID, workspaceID, id, itemID, toString(getArg(args, "content")), toTimePtr(getArg(args, "due_time")), toBool(getArg(args, "clear_due_time")))
	})

	s.registerTool("toggle_todo_item", "Toggle a checklist item's done state.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":      map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"item_id": map[string]interface{}{"type": "integer", "description": "Todo item ID"},
		},
		"required": []string{"id", "item_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		itemID := toUint(getArg(args, "item_id"))
		return s.todoSvc.ToggleItem(ctx, userID, workspaceID, id, itemID)
	})

	s.registerTool("delete_todo_item", "Delete a checklist (subtask) item from a todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":      map[string]interface{}{"type": "integer", "description": "Todo ID"},
			"item_id": map[string]interface{}{"type": "integer", "description": "Todo item ID"},
		},
		"required": []string{"id", "item_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		itemID := toUint(getArg(args, "item_id"))
		if err := s.todoSvc.DeleteItem(ctx, userID, workspaceID, id, itemID); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "todo item deleted"}, nil
	})

	// --- Additional todo operations ---

	s.registerTool("pin_todo", "Pin/unpin a todo (star it to the top).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.TogglePin(ctx, userID, workspaceID, id)
	})

	s.registerTool("duplicate_todo", "Duplicate a todo (copies fields, items and tags).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.todoSvc.Duplicate(ctx, userID, workspaceID, id)
	})

	s.registerTool("reorder_todo", "Move a todo within the workspace's manual order, after the given id (or to the top).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":       map[string]interface{}{"type": "integer", "description": "Todo ID to move"},
			"after_id": map[string]interface{}{"type": "integer", "description": "Todo ID to place it after (omit for top)"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		var afterID *uint
		if v := getArg(args, "after_id"); v != nil {
			u := toUint(v)
			afterID = &u
		}
		if err := s.todoSvc.Reorder(ctx, userID, workspaceID, id, afterID); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "todo reordered"}, nil
	})

	s.registerTool("move_todo", "Reparent a todo to build the task tree: nest it under parent_id (omit/0 = root) and place it after after_id among its siblings.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":        map[string]interface{}{"type": "integer", "description": "Todo ID to move"},
			"parent_id": map[string]interface{}{"type": "integer", "description": "New parent todo ID (omit or 0 for root/top level)"},
			"after_id":  map[string]interface{}{"type": "integer", "description": "Sibling todo ID to place it after (omit for top of its sibling group)"},
			"position":  map[string]interface{}{"type": "string", "enum": []string{"first", "last"}, "description": "Position among siblings when after_id is omitted: 'last' appends at the end, 'first' (default) at the top"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		var parentID *uint
		if v := getArg(args, "parent_id"); v != nil {
			if u := toUint(v); u != 0 {
				parentID = &u
			}
		}
		var afterID *uint
		if v := getArg(args, "after_id"); v != nil {
			u := toUint(v)
			afterID = &u
		}
		if err := s.todoSvc.Move(ctx, userID, workspaceID, id, parentID, afterID, toString(getArg(args, "position"))); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "todo moved"}, nil
	})

	s.registerTool("bulk_complete_todos", "Mark many pending todos done (recurring ones advance).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Todo IDs"},
		},
		"required": []string{"ids"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		ids := toUintSlice(getArg(args, "ids"))
		affected, err := s.todoSvc.BulkAction(ctx, userID, workspaceID, ids, "complete")
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"affected": affected}, nil
	})

	s.registerTool("list_trashed_todos", "List soft-deleted todos (the trash).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.todoSvc.ListTrash(ctx, userID, workspaceID)
	})

	s.registerTool("restore_todo", "Restore a soft-deleted todo.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Todo ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		if err := s.todoSvc.Restore(ctx, userID, workspaceID, toUint(getArg(args, "id"))); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "todo restored"}, nil
	})
}
