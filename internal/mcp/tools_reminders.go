package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerReminderTools() {
	s.registerTool("list_reminders", "List reminders with optional status filter.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"status": map[string]interface{}{"type": "string", "description": "Filter by status: pending, done, or snoozed", "default": "pending"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		status := model.ReminderStatus(toString(getArg(args, "status")))
		if status == "" {
			status = model.ReminderPending
		}
		reminders, _, err := s.reminderSvc.List(ctx, userID, workspaceID, status, nil, 1, 200)
		return reminders, err
	})

	s.registerTool("create_reminder", "Create a new reminder for a contact.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id":  map[string]interface{}{"type": "integer", "description": "Contact ID"},
			"title":       map[string]interface{}{"type": "string", "description": "Reminder title"},
			"description": map[string]interface{}{"type": "string", "description": "Reminder description"},
			"remind_at":   map[string]interface{}{"type": "string", "description": "When to remind (RFC3339)"},
		},
		"required": []string{"contact_id", "title", "remind_at"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		reminder := &model.Reminder{
			Title:       toString(getArg(args, "title")),
			Description: toString(getArg(args, "description")),
			RemindAt:    toTime(getArg(args, "remind_at")),
		}
		return s.reminderSvc.Create(ctx, userID, workspaceID, contactID, reminder)
	})

	s.registerTool("update_reminder", "Update an existing reminder.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":          map[string]interface{}{"type": "integer", "description": "Reminder ID"},
			"title":       map[string]interface{}{"type": "string", "description": "Reminder title"},
			"description": map[string]interface{}{"type": "string", "description": "Reminder description"},
			"remind_at":   map[string]interface{}{"type": "string", "description": "When to remind (RFC3339)"},
			"status":      map[string]interface{}{"type": "string", "description": "Status: pending, done, or snoozed"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Reminder{
			Title:       toString(getArg(args, "title")),
			Description: toString(getArg(args, "description")),
			RemindAt:    toTime(getArg(args, "remind_at")),
			Status:      model.ReminderStatus(toString(getArg(args, "status"))),
		}
		return s.reminderSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_reminder", "Delete a reminder by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Reminder ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.reminderSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "reminder deleted"}, nil
	})
}
