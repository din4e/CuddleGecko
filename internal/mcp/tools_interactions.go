package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerInteractionTools() {
	s.registerTool("list_interactions", "List interactions for a contact with optional pagination.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id": map[string]interface{}{"type": "integer", "description": "Contact ID"},
			"page":       map[string]interface{}{"type": "integer", "description": "Page number (default 1)", "default": 1},
			"page_size":  map[string]interface{}{"type": "integer", "description": "Items per page (default 20)", "default": 20},
		},
		"required": []string{"contact_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		page := getArgInt(args, "page", 1)
		pageSize := getArgInt(args, "page_size", 20)

		interactions, total, err := s.interactionSvc.ListByContact(ctx, userID, workspaceID, contactID, page, pageSize)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"interactions": interactions,
			"total":        total,
			"page":         page,
			"page_size":    pageSize,
		}, nil
	})

	s.registerTool("create_interaction", "Create a new interaction for a contact.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id":  map[string]interface{}{"type": "integer", "description": "Contact ID"},
			"type":        map[string]interface{}{"type": "string", "description": "Interaction type: meeting, call, message, email, other"},
			"title":       map[string]interface{}{"type": "string", "description": "Interaction title"},
			"content":     map[string]interface{}{"type": "string", "description": "Interaction content/notes"},
			"occurred_at": map[string]interface{}{"type": "string", "description": "When the interaction occurred (RFC3339)"},
		},
		"required": []string{"contact_id", "type", "title", "occurred_at"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		interaction := &model.Interaction{
			Type:       model.InteractionType(toString(getArg(args, "type"))),
			Title:      toString(getArg(args, "title")),
			Content:    toString(getArg(args, "content")),
			OccurredAt: toTime(getArg(args, "occurred_at")),
		}
		return s.interactionSvc.Create(ctx, userID, workspaceID, contactID, interaction)
	})

	s.registerTool("update_interaction", "Update an existing interaction.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":          map[string]interface{}{"type": "integer", "description": "Interaction ID"},
			"type":        map[string]interface{}{"type": "string", "description": "Interaction type: meeting, call, message, email, other"},
			"title":       map[string]interface{}{"type": "string", "description": "Interaction title"},
			"content":     map[string]interface{}{"type": "string", "description": "Interaction content/notes"},
			"occurred_at": map[string]interface{}{"type": "string", "description": "When the interaction occurred (RFC3339)"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Interaction{
			Type:       model.InteractionType(toString(getArg(args, "type"))),
			Title:      toString(getArg(args, "title")),
			Content:    toString(getArg(args, "content")),
			OccurredAt: toTime(getArg(args, "occurred_at")),
		}
		return s.interactionSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_interaction", "Delete an interaction by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Interaction ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.interactionSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "interaction deleted"}, nil
	})
}
