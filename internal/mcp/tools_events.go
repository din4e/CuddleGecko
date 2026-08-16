package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerEventTools() {
	s.registerTool("list_events", "List events with optional pagination and date filtering.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"page":        map[string]interface{}{"type": "integer", "description": "Page number (default 1)", "default": 1},
			"page_size":   map[string]interface{}{"type": "integer", "description": "Items per page (default 20)", "default": 20},
			"start_after": map[string]interface{}{"type": "string", "description": "Filter events starting after this date (RFC3339)"},
			"end_before":  map[string]interface{}{"type": "string", "description": "Filter events ending before this date (RFC3339)"},
			"search":      map[string]interface{}{"type": "string", "description": "Case-insensitive substring match on title"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		page := getArgInt(args, "page", 1)
		pageSize := getArgInt(args, "page_size", 20)
		search := toString(getArg(args, "search"))
		var startAfter *string
		if v := getArg(args, "start_after"); v != nil {
			s := toString(v)
			startAfter = &s
		}
		var endBefore *string
		if v := getArg(args, "end_before"); v != nil {
			s := toString(v)
			endBefore = &s
		}

		events, total, err := s.eventSvc.List(ctx, userID, workspaceID, page, pageSize, startAfter, endBefore, search)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"events":    events,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		}, nil
	})

	s.registerTool("create_event", "Create a new event.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title":       map[string]interface{}{"type": "string", "description": "Event title"},
			"description": map[string]interface{}{"type": "string", "description": "Event description"},
			"start_time":  map[string]interface{}{"type": "string", "description": "Start time (RFC3339)"},
			"end_time":    map[string]interface{}{"type": "string", "description": "End time (RFC3339)"},
			"location":    map[string]interface{}{"type": "string", "description": "Event location"},
			"contact_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":       map[string]interface{}{"type": "string", "description": "Event color"},
		},
		"required": []string{"title", "start_time"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		event := &model.Event{
			Title:       toString(getArg(args, "title")),
			Description: toString(getArg(args, "description")),
			StartTime:   toTime(getArg(args, "start_time")),
			EndTime:     toTimePtr(getArg(args, "end_time")),
			Location:    toString(getArg(args, "location")),
			ContactIDs:  toUintSlice(getArg(args, "contact_ids")),
			Color:       toString(getArg(args, "color")),
		}
		return s.eventSvc.Create(ctx, userID, workspaceID, event)
	})

	s.registerTool("update_event", "Update an existing event.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":          map[string]interface{}{"type": "integer", "description": "Event ID"},
			"title":       map[string]interface{}{"type": "string", "description": "Event title"},
			"description": map[string]interface{}{"type": "string", "description": "Event description"},
			"start_time":  map[string]interface{}{"type": "string", "description": "Start time (RFC3339)"},
			"end_time":    map[string]interface{}{"type": "string", "description": "End time (RFC3339)"},
			"location":    map[string]interface{}{"type": "string", "description": "Event location"},
			"contact_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"color":       map[string]interface{}{"type": "string", "description": "Event color"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Event{
			Title:       toString(getArg(args, "title")),
			Description: toString(getArg(args, "description")),
			StartTime:   toTime(getArg(args, "start_time")),
			EndTime:     toTimePtr(getArg(args, "end_time")),
			Location:    toString(getArg(args, "location")),
			ContactIDs:  toUintSlice(getArg(args, "contact_ids")),
			Color:       toString(getArg(args, "color")),
		}
		return s.eventSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_event", "Delete an event by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Event ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.eventSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "event deleted"}, nil
	})
}
