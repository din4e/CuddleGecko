package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

// registerFitnessTools exposes the extended fitness features (exercise
// library, templates, PRs) over MCP.
func (s *MCPServer) registerFitnessTools() {
	s.registerTool("list_exercise_library", "List reusable exercise (movement) definitions.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"q": map[string]interface{}{"type": "string", "description": "Optional name search"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.fitnessSvc.ListLibrary(ctx, userID, workspaceID, toString(getArg(args, "q")))
	})

	s.registerTool("create_exercise_library_item", "Add a reusable exercise definition.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name":          map[string]interface{}{"type": "string"},
			"category":      map[string]interface{}{"type": "string"},
			"muscle_groups": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
			"equipment":     map[string]interface{}{"type": "string"},
			"notes":         map[string]interface{}{"type": "string"},
		},
		"required": []string{"name"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.fitnessSvc.CreateLibraryItem(ctx, userID, workspaceID, &model.ExerciseLibraryItem{
			Name:         toString(getArg(args, "name")),
			Category:     toString(getArg(args, "category")),
			MuscleGroups: toStringSlice(getArg(args, "muscle_groups")),
			Equipment:    toString(getArg(args, "equipment")),
			Notes:        toString(getArg(args, "notes")),
		})
	})

	s.registerTool("list_workout_templates", "List reusable workout templates (routines).", map[string]interface{}{
		"type": "object",
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.fitnessSvc.ListTemplates(ctx, userID, workspaceID)
	})

	s.registerTool("instantiate_workout_template", "Create a planned workout (with exercises) from a template.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":           map[string]interface{}{"type": "integer", "description": "Template ID"},
			"scheduled_at": map[string]interface{}{"type": "string", "description": "RFC3339 schedule time (optional)"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		return s.fitnessSvc.InstantiateTemplate(ctx, userID, workspaceID, id, toTimePtr(getArg(args, "scheduled_at")))
	})

	s.registerTool("workout_prs", "List personal records (best weight and estimated 1RM) per exercise.", map[string]interface{}{
		"type": "object",
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.fitnessSvc.PRs(ctx, userID, workspaceID)
	})

	s.registerTool("list_fitness_goals", "List fitness goals with computed current progress.", map[string]interface{}{
		"type": "object",
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.fitnessSvc.ListGoals(ctx, userID, workspaceID)
	})

	s.registerTool("workout_history", "Aggregate completed workouts per week or month.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"bucket": map[string]interface{}{"type": "string", "description": "week (default) or month"},
			"limit":  map[string]interface{}{"type": "integer", "description": "Number of buckets (default 12)"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		bucket := toString(getArg(args, "bucket"))
		if bucket == "" {
			bucket = "week"
		}
		return s.workoutSvc.History(ctx, userID, workspaceID, bucket, getArgInt(args, "limit", 12))
	})
}
