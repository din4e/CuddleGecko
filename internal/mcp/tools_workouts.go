package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

// toIntPtr extracts a *int from an MCP arg (numbers arrive as float64 from JSON).
func toIntPtr(v interface{}) *int {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case float64:
		i := int(val)
		return &i
	case int:
		return &val
	case int64:
		i := int(val)
		return &i
	default:
		return nil
	}
}

func (s *MCPServer) registerWorkoutTools() {
	s.registerTool("list_workouts", "List workouts (training plans) with optional filters.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"status": map[string]interface{}{"type": "string", "description": "Filter by status: planned, in_progress, completed or skipped"},
			"type":   map[string]interface{}{"type": "string", "description": "Filter by type: strength, cardio, flexibility, balance, sport or other"},
			"q":      map[string]interface{}{"type": "string", "description": "Case-insensitive substring match on name"},
			"sort":   map[string]interface{}{"type": "string", "description": "Sort key: scheduled (default), created or manual"},
			"order":  map[string]interface{}{"type": "string", "description": "Sort order: asc (default) or desc"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		q := model.WorkoutListQuery{
			Status: toString(getArg(args, "status")),
			Type:   toString(getArg(args, "type")),
			Search: toString(getArg(args, "q")),
			Sort:   toString(getArg(args, "sort")),
			Order:  toString(getArg(args, "order")),
			Page:   1, PageSize: 200,
		}
		workouts, _, err := s.workoutSvc.List(ctx, userID, workspaceID, q)
		return workouts, err
	})

	s.registerTool("create_workout", "Create a new workout (training plan).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name":         map[string]interface{}{"type": "string", "description": "Workout name"},
			"type":         map[string]interface{}{"type": "string", "description": "Type: strength, cardio, flexibility, balance, sport or other (default other)"},
			"status":       map[string]interface{}{"type": "string", "description": "Status: planned (default), in_progress, completed or skipped"},
			"intensity":    map[string]interface{}{"type": "string", "description": "Intensity: low, medium or high"},
			"scheduled_at": map[string]interface{}{"type": "string", "description": "Scheduled time (RFC3339)"},
			"duration_min": map[string]interface{}{"type": "integer", "description": "Duration in minutes"},
			"calories":     map[string]interface{}{"type": "number", "description": "Calories burned"},
			"color":        map[string]interface{}{"type": "string", "description": "Color"},
			"location":     map[string]interface{}{"type": "string", "description": "Location"},
			"notes":        map[string]interface{}{"type": "string", "description": "Notes"},
		},
		"required": []string{"name"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		w := &model.Workout{
			Name:        toString(getArg(args, "name")),
			Type:        toString(getArg(args, "type")),
			Status:      toString(getArg(args, "status")),
			Intensity:   toString(getArg(args, "intensity")),
			ScheduledAt: toTimePtr(getArg(args, "scheduled_at")),
			DurationMin: toIntPtr(getArg(args, "duration_min")),
			Calories:    toFloat64Ptr(getArg(args, "calories")),
			Color:       toString(getArg(args, "color")),
			Location:    toString(getArg(args, "location")),
			Notes:       toString(getArg(args, "notes")),
		}
		return s.workoutSvc.Create(ctx, userID, workspaceID, w)
	})

	s.registerTool("update_workout", "Update an existing workout.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":                 map[string]interface{}{"type": "integer", "description": "Workout ID"},
			"name":               map[string]interface{}{"type": "string", "description": "Workout name"},
			"type":               map[string]interface{}{"type": "string", "description": "Type"},
			"status":             map[string]interface{}{"type": "string", "description": "Status"},
			"intensity":          map[string]interface{}{"type": "string", "description": "Intensity"},
			"scheduled_at":       map[string]interface{}{"type": "string", "description": "Scheduled time (RFC3339)"},
			"clear_scheduled_at": map[string]interface{}{"type": "boolean", "description": "Clear the scheduled time"},
			"duration_min":       map[string]interface{}{"type": "integer", "description": "Duration in minutes"},
			"clear_duration_min": map[string]interface{}{"type": "boolean", "description": "Clear the duration"},
			"calories":           map[string]interface{}{"type": "number", "description": "Calories burned"},
			"clear_calories":     map[string]interface{}{"type": "boolean", "description": "Clear the calories"},
			"color":              map[string]interface{}{"type": "string", "description": "Color"},
			"location":           map[string]interface{}{"type": "string", "description": "Location"},
			"notes":              map[string]interface{}{"type": "string", "description": "Notes"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Workout{
			Name:        toString(getArg(args, "name")),
			Type:        toString(getArg(args, "type")),
			Status:      toString(getArg(args, "status")),
			Intensity:   toString(getArg(args, "intensity")),
			ScheduledAt: toTimePtr(getArg(args, "scheduled_at")),
			DurationMin: toIntPtr(getArg(args, "duration_min")),
			Calories:    toFloat64Ptr(getArg(args, "calories")),
			Color:       toString(getArg(args, "color")),
			Location:    toString(getArg(args, "location")),
			Notes:       toString(getArg(args, "notes")),
		}
		clear := service.WorkoutClear{
			ScheduledAt: toBool(getArg(args, "clear_scheduled_at")),
			DurationMin: toBool(getArg(args, "clear_duration_min")),
			Calories:    toBool(getArg(args, "clear_calories")),
		}
		return s.workoutSvc.Update(ctx, userID, workspaceID, id, updates, clear)
	})

	s.registerTool("toggle_workout", "Toggle a workout between completed and not-completed.", map[string]interface{}{
		"type":     "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Workout ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return s.workoutSvc.ToggleStatus(ctx, userID, workspaceID, toUint(getArg(args, "id")))
	})

	s.registerTool("delete_workout", "Delete a workout (and its exercises).", map[string]interface{}{
		"type":     "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Workout ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		return nil, s.workoutSvc.Delete(ctx, userID, workspaceID, toUint(getArg(args, "id")))
	})

	s.registerTool("list_body_metrics", "List body / health records (newest first).", map[string]interface{}{
		"type":     "object",
		"properties": map[string]interface{}{
			"page":      map[string]interface{}{"type": "integer", "description": "Page number (default 1)"},
			"page_size": map[string]interface{}{"type": "integer", "description": "Page size (default 100)"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		metrics, _, err := s.workoutSvc.ListMetrics(ctx, userID, workspaceID, model.BodyMetricListQuery{Page: getArgInt(args, "page", 1), PageSize: getArgInt(args, "page_size", 100)})
		return metrics, err
	})

	s.registerTool("create_body_metric", "Record a body / health measurement.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"recorded_at": map[string]interface{}{"type": "string", "description": "Recorded time (RFC3339; defaults to now)"},
			"weight":      map[string]interface{}{"type": "number", "description": "Weight in kg"},
			"height":      map[string]interface{}{"type": "number", "description": "Height in cm"},
			"body_fat":    map[string]interface{}{"type": "number", "description": "Body fat %"},
			"muscle_mass": map[string]interface{}{"type": "number", "description": "Muscle mass in kg"},
			"resting_hr":  map[string]interface{}{"type": "integer", "description": "Resting heart rate"},
			"systolic":    map[string]interface{}{"type": "integer", "description": "Systolic blood pressure"},
			"diastolic":   map[string]interface{}{"type": "integer", "description": "Diastolic blood pressure"},
			"sleep_hours": map[string]interface{}{"type": "number", "description": "Sleep hours"},
			"steps":       map[string]interface{}{"type": "integer", "description": "Step count"},
			"energy":      map[string]interface{}{"type": "integer", "description": "Energy 1-5"},
			"mood":        map[string]interface{}{"type": "integer", "description": "Mood 1-5"},
			"notes":       map[string]interface{}{"type": "string", "description": "Notes"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		m := &model.BodyMetric{
			Weight:     toFloat64Ptr(getArg(args, "weight")),
			Height:     toFloat64Ptr(getArg(args, "height")),
			BodyFat:    toFloat64Ptr(getArg(args, "body_fat")),
			MuscleMass: toFloat64Ptr(getArg(args, "muscle_mass")),
			RestingHR:  toIntPtr(getArg(args, "resting_hr")),
			Systolic:   toIntPtr(getArg(args, "systolic")),
			Diastolic:  toIntPtr(getArg(args, "diastolic")),
			SleepHours: toFloat64Ptr(getArg(args, "sleep_hours")),
			Steps:      toIntPtr(getArg(args, "steps")),
			Energy:     toIntPtr(getArg(args, "energy")),
			Mood:       toIntPtr(getArg(args, "mood")),
			Notes:      toString(getArg(args, "notes")),
		}
		if t := toTimePtr(getArg(args, "recorded_at")); t != nil {
			m.RecordedAt = *t
		}
		return s.workoutSvc.CreateMetric(ctx, userID, workspaceID, m)
	})

	s.registerTool("body_summary", "Get an overview of the latest body / health records (latest snapshot, weight trend, count).", map[string]interface{}{
		"type":     "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, _ map[string]interface{}) (interface{}, error) {
		return s.workoutSvc.BodySummary(ctx, userID, workspaceID)
	})
}
