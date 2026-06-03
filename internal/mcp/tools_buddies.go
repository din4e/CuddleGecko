package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerBuddyTools() {
	s.registerTool("list_buddies", "List contacts (buddies) with optional pagination, search, and tag filtering.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"page":      map[string]interface{}{"type": "integer", "description": "Page number (default 1)", "default": 1},
			"page_size": map[string]interface{}{"type": "integer", "description": "Items per page (default 20, max 100)", "default": 20},
			"search":    map[string]interface{}{"type": "string", "description": "Search term for name/phone/email"},
			"tag_ids":   map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Filter by tag IDs"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		page := getArgInt(args, "page", 1)
		pageSize := getArgInt(args, "page_size", 20)
		search := toString(getArg(args, "search"))
		tagIDs := toUintSlice(getArg(args, "tag_ids"))

		contacts, total, err := s.contactSvc.List(ctx, userID, workspaceID, page, pageSize, search, tagIDs)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"contacts": contacts,
			"total":    total,
			"page":     page,
			"page_size": pageSize,
		}, nil
	})

	s.registerTool("get_buddy", "Get a single contact (buddy) by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Contact ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.contactSvc.GetByID(ctx, userID, workspaceID, id)
	})

	s.registerTool("create_buddy", "Create a new contact (buddy).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name":               map[string]interface{}{"type": "string", "description": "Contact name"},
			"nickname":           map[string]interface{}{"type": "string", "description": "Nickname"},
			"avatar_emoji":       map[string]interface{}{"type": "string", "description": "Avatar emoji"},
			"phones":             map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "Phone numbers"},
			"emails":             map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "Email addresses"},
			"birthday":           map[string]interface{}{"type": "string", "description": "Birthday (RFC3339 date)"},
			"notes":              map[string]interface{}{"type": "string", "description": "Notes about the contact"},
			"relationship_labels": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "Relationship labels (e.g. friend, family)"},
		},
		"required": []string{"name"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contact := &model.Contact{
			Name:               toString(getArg(args, "name")),
			Nickname:           toString(getArg(args, "nickname")),
			AvatarEmoji:        toString(getArg(args, "avatar_emoji")),
			Phone:              toStringSlice(getArg(args, "phones")),
			Email:              toStringSlice(getArg(args, "emails")),
			Birthday:           toTimePtr(getArg(args, "birthday")),
			Notes:              toString(getArg(args, "notes")),
			RelationshipLabels: toStringSlice(getArg(args, "relationship_labels")),
		}
		return s.contactSvc.Create(ctx, userID, workspaceID, contact)
	})

	s.registerTool("update_buddy", "Update an existing contact (buddy).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":                 map[string]interface{}{"type": "integer", "description": "Contact ID"},
			"name":               map[string]interface{}{"type": "string", "description": "Contact name"},
			"nickname":           map[string]interface{}{"type": "string", "description": "Nickname"},
			"avatar_emoji":       map[string]interface{}{"type": "string", "description": "Avatar emoji"},
			"phones":             map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "Phone numbers"},
			"emails":             map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "Email addresses"},
			"birthday":           map[string]interface{}{"type": "string", "description": "Birthday (RFC3339 date)"},
			"notes":              map[string]interface{}{"type": "string", "description": "Notes about the contact"},
			"relationship_labels": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "Relationship labels"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Contact{
			Name:               toString(getArg(args, "name")),
			Nickname:           toString(getArg(args, "nickname")),
			AvatarEmoji:        toString(getArg(args, "avatar_emoji")),
			Phone:              toStringSlice(getArg(args, "phones")),
			Email:              toStringSlice(getArg(args, "emails")),
			Birthday:           toTimePtr(getArg(args, "birthday")),
			Notes:              toString(getArg(args, "notes")),
			RelationshipLabels: toStringSlice(getArg(args, "relationship_labels")),
		}
		return s.contactSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_buddy", "Delete a contact (buddy) by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Contact ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.contactSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "buddy deleted"}, nil
	})

	s.registerTool("get_buddy_tags", "Get tags assigned to a contact.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id": map[string]interface{}{"type": "integer", "description": "Contact ID"},
		},
		"required": []string{"contact_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		return s.contactSvc.GetTags(ctx, userID, workspaceID, contactID)
	})

	s.registerTool("set_buddy_tags", "Replace all tags on a contact with the given tag IDs.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id": map[string]interface{}{"type": "integer", "description": "Contact ID"},
			"tag_ids":    map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Tag IDs to assign"},
		},
		"required": []string{"contact_id", "tag_ids"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		tagIDs := toUintSlice(getArg(args, "tag_ids"))
		err := s.contactSvc.ReplaceTags(ctx, userID, workspaceID, contactID, tagIDs)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "tags updated"}, nil
	})
}
