package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/service"
)

func (s *MCPServer) registerAITools() {
	s.registerTool("analyze_relationship", "Analyze a contact relationship using AI.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"contact_id": map[string]interface{}{"type": "integer", "description": "Contact ID to analyze"},
		},
		"required": []string{"contact_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		contactID := toUint(getArg(args, "contact_id"))
		result, err := s.aiSvc.AnalyzeRelationship(ctx, userID, workspaceID, contactID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"analysis": result}, nil
	})

	s.registerTool("analyze_event", "Analyze an event using AI.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"event_id": map[string]interface{}{"type": "integer", "description": "Event ID to analyze"},
		},
		"required": []string{"event_id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		eventID := toUint(getArg(args, "event_id"))
		result, err := s.aiSvc.AnalyzeEvent(ctx, userID, workspaceID, eventID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"analysis": result}, nil
	})

	s.registerTool("analyze_comprehensive", "Perform a comprehensive AI analysis across contacts, events, and finances.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"type":        map[string]interface{}{"type": "string", "description": "Analysis type: contact, event, financial, or comprehensive"},
			"contact_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Contact IDs for analysis"},
			"event_ids":   map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Event IDs for analysis"},
			"question":    map[string]interface{}{"type": "string", "description": "Custom question for the AI"},
		},
		"required": []string{"type"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		req := service.AnalyzeRequest{
			Type:       toString(getArg(args, "type")),
			ContactIDs: toUintSlice(getArg(args, "contact_ids")),
			EventIDs:   toUintSlice(getArg(args, "event_ids")),
			Question:   toString(getArg(args, "question")),
		}
		result, err := s.aiSvc.AnalyzeComprehensive(ctx, userID, workspaceID, req)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"analysis": result}, nil
	})
}
