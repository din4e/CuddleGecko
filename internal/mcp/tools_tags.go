package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerTagTools() {
	s.registerTool("list_tags", "List all tags in the current workspace.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.tagSvc.List(ctx, userID, workspaceID)
	})

	s.registerTool("create_tag", "Create a new tag.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name":  map[string]interface{}{"type": "string", "description": "Tag name"},
			"color": map[string]interface{}{"type": "string", "description": "Tag color (hex, e.g. #ff0000)"},
		},
		"required": []string{"name"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		tag := &model.Tag{
			Name:  toString(getArg(args, "name")),
			Color: toString(getArg(args, "color")),
		}
		return s.tagSvc.Create(ctx, userID, workspaceID, tag)
	})

	s.registerTool("update_tag", "Update an existing tag.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":    map[string]interface{}{"type": "integer", "description": "Tag ID"},
			"name":  map[string]interface{}{"type": "string", "description": "Tag name"},
			"color": map[string]interface{}{"type": "string", "description": "Tag color (hex)"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Tag{
			Name:  toString(getArg(args, "name")),
			Color: toString(getArg(args, "color")),
		}
		return s.tagSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_tag", "Delete a tag by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Tag ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.tagSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "tag deleted"}, nil
	})
}
