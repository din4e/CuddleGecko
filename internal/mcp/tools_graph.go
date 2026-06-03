package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerGraphTools() {
	s.registerTool("get_graph", "Get the full relationship graph data (nodes and edges).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.relationSvc.GetGraphData(ctx, userID, workspaceID)
	})

	s.registerTool("get_relations", "Get all relations for a specific contact.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id": map[string]interface{}{"type": "integer", "description": "Contact ID"},
		},
		"required": []string{"contact_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		return s.relationSvc.ListByContact(ctx, userID, workspaceID, contactID)
	})

	s.registerTool("create_relation", "Create a relation between two contacts.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id_a": map[string]interface{}{"type": "integer", "description": "First contact ID"},
			"contact_id_b": map[string]interface{}{"type": "integer", "description": "Second contact ID"},
			"relation_type": map[string]interface{}{"type": "string", "description": "Type of relation (e.g. friend, colleague, family)"},
		},
		"required": []string{"contact_id_a", "contact_id_b"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactIDA := toUint(getArg(args, "contact_id_a"))
		relation := &model.ContactRelation{
			ContactIDB:  toUint(getArg(args, "contact_id_b")),
			RelationType: toString(getArg(args, "relation_type")),
		}
		return s.relationSvc.Create(ctx, userID, workspaceID, contactIDA, relation)
	})

	s.registerTool("delete_relation", "Delete a relation by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Relation ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.relationSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "relation deleted"}, nil
	})
}
