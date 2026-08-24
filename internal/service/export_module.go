package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Module names for the per-module export/import endpoints (URL segment, kebab
// case). Each supports both CSV (spreadsheet-friendly, lossy where structure is
// nested) and JSON (full fidelity) formats.
const (
	ModuleContacts     = "contacts"
	ModuleTags         = "tags"
	ModuleInteractions = "interactions"
	ModuleRelations    = "relations"
	ModuleReminders    = "reminders"
	ModuleTodos        = "todos"
	ModuleTransactions = "transactions"
	ModuleEvents       = "events"
	ModuleWorkouts     = "workouts"
	ModuleBodyMetrics  = "body-metrics"
	ModuleHabits       = "habits"
	ModulePomodoros    = "pomodoros"
	ModuleFitness      = "fitness"
)

var moduleNames = map[string]bool{
	ModuleContacts: true, ModuleTags: true, ModuleInteractions: true, ModuleRelations: true,
	ModuleReminders: true, ModuleTodos: true, ModuleTransactions: true, ModuleEvents: true,
	ModuleWorkouts: true, ModuleBodyMetrics: true, ModuleHabits: true, ModulePomodoros: true,
	ModuleFitness: true,
}

// ValidModule reports whether name is a known module slug.
func ValidModule(name string) bool {
	return moduleNames[strings.ToLower(strings.TrimSpace(name))]
}

// ImportStats reports how many rows were created and how many were skipped
// (blank/invalid rows and duplicates keyed on the module's dedup fields).
type ImportStats struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

// ExportModuleJSON renders one module as a standalone JSON document (same shape
// as the full backup, but only this module's field populated). A module JSON
// can be re-imported alone — FK references to rows not in the payload resolve
// against existing workspace rows.
func (s *ExportService) ExportModuleJSON(ctx context.Context, userID, workspaceID uint, module string) (string, error) {
	data, err := s.ExportJSON(ctx, userID, workspaceID)
	if err != nil {
		return "", err
	}
	var full ExportData
	if err := json.Unmarshal([]byte(data), &full); err != nil {
		return "", fmt.Errorf("module export: %w", err)
	}
	keep := ExportData{Version: full.Version, ExportedAt: full.ExportedAt}
	switch strings.ToLower(module) {
	case ModuleContacts:
		keep.Data.Contacts = full.Data.Contacts
	case ModuleTags:
		keep.Data.Tags = full.Data.Tags
	case ModuleInteractions:
		keep.Data.Interactions = full.Data.Interactions
	case ModuleRelations:
		keep.Data.Relations = full.Data.Relations
	case ModuleReminders:
		keep.Data.Reminders = full.Data.Reminders
	case ModuleTodos:
		keep.Data.Todos = full.Data.Todos
	case ModuleTransactions:
		keep.Data.Transactions = full.Data.Transactions
	case ModuleEvents:
		keep.Data.Events = full.Data.Events
	case ModuleWorkouts:
		keep.Data.Workouts = full.Data.Workouts
	case ModuleBodyMetrics:
		keep.Data.BodyMetrics = full.Data.BodyMetrics
	case ModuleHabits:
		keep.Data.Habits = full.Data.Habits
	case ModulePomodoros:
		keep.Data.Pomodoros = full.Data.Pomodoros
	case ModuleFitness:
		// Fitness is a composite: library + templates + set logs + goals. Set
		// logs need their workouts/exercises for id remapping, so workouts ride
		// along in the fitness payload.
		keep.Data.ExerciseLibrary = full.Data.ExerciseLibrary
		keep.Data.WorkoutTemplates = full.Data.WorkoutTemplates
		keep.Data.SetLogs = full.Data.SetLogs
		keep.Data.FitnessGoals = full.Data.FitnessGoals
		keep.Data.Workouts = full.Data.Workouts
	default:
		return "", fmt.Errorf("unknown module %q", module)
	}
	bytes, err := json.MarshalIndent(keep, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// ImportModuleJSON imports a module JSON (full-backup shape — only the named
// module's field is read). Everything else in the payload is ignored, so a full
// backup file can be used to restore a single module.
func (s *ExportService) ImportModuleJSON(ctx context.Context, userID, workspaceID uint, module, jsonData string) (ImportStats, error) {
	var data ExportData
	if err := json.Unmarshal([]byte(jsonData), &data); err != nil {
		return ImportStats{}, fmt.Errorf("invalid JSON: %w", err)
	}
	if data.Version == "" {
		return ImportStats{}, fmt.Errorf("missing version field")
	}
	// Keep only the requested module's field(s), then run the shared import
	// path (which identity-seeds FK maps from existing workspace rows, so a
	// module file from this workspace keeps its contact/todo references).
	src := data.Data
	keep := ExportPayload{}
	var stats ImportStats
	switch strings.ToLower(module) {
	case ModuleContacts:
		keep.Contacts = src.Contacts
		stats.Imported = len(src.Contacts)
	case ModuleTags:
		keep.Tags = src.Tags
		stats.Imported = len(src.Tags)
	case ModuleInteractions:
		keep.Interactions = src.Interactions
		stats.Imported = len(src.Interactions)
	case ModuleRelations:
		keep.Relations = src.Relations
		stats.Imported = len(src.Relations)
	case ModuleReminders:
		keep.Reminders = src.Reminders
		stats.Imported = len(src.Reminders)
	case ModuleTodos:
		keep.Todos = src.Todos
		stats.Imported = len(src.Todos)
	case ModuleTransactions:
		keep.Transactions = src.Transactions
		stats.Imported = len(src.Transactions)
	case ModuleEvents:
		keep.Events = src.Events
		stats.Imported = len(src.Events)
	case ModuleWorkouts:
		keep.Workouts = src.Workouts
		stats.Imported = len(src.Workouts)
	case ModuleBodyMetrics:
		keep.BodyMetrics = src.BodyMetrics
		stats.Imported = len(src.BodyMetrics)
	case ModuleHabits:
		keep.Habits = src.Habits
		stats.Imported = len(src.Habits)
	case ModulePomodoros:
		keep.Pomodoros = src.Pomodoros
		stats.Imported = len(src.Pomodoros)
	case ModuleFitness:
		// Fitness is composite; workouts ride along for set-log id remapping.
		keep.Workouts = src.Workouts
		keep.ExerciseLibrary = src.ExerciseLibrary
		keep.WorkoutTemplates = src.WorkoutTemplates
		keep.SetLogs = src.SetLogs
		keep.FitnessGoals = src.FitnessGoals
		stats.Imported = len(src.Workouts) + len(src.ExerciseLibrary) + len(src.WorkoutTemplates) + len(src.SetLogs) + len(src.FitnessGoals)
	default:
		return ImportStats{}, fmt.Errorf("unknown module %q", module)
	}
	data.Data = keep
	filtered, err := json.Marshal(data)
	if err != nil {
		return ImportStats{}, err
	}
	if err := s.ImportJSON(ctx, userID, workspaceID, string(filtered)); err != nil {
		return ImportStats{}, err
	}
	return stats, nil
}

// ExportModuleCSV renders one module as CSV, dispatching to the module-specific
// exporter.
func (s *ExportService) ExportModuleCSV(ctx context.Context, workspaceID uint, module string) (string, error) {
	switch strings.ToLower(module) {
	case ModuleTodos:
		return s.ExportTodosCSV(ctx, workspaceID)
	case ModuleContacts:
		return s.ExportContactsCSV(ctx, workspaceID)
	case ModuleTransactions:
		return s.ExportTransactionsCSV(ctx, workspaceID)
	case ModuleEvents:
		return s.ExportEventsCSV(ctx, workspaceID)
	case ModuleTags:
		return s.ExportTagsCSV(ctx, workspaceID)
	case ModuleInteractions:
		return s.ExportInteractionsCSV(ctx, workspaceID)
	case ModuleRelations:
		return s.ExportRelationsCSV(ctx, workspaceID)
	case ModuleReminders:
		return s.ExportRemindersCSV(ctx, workspaceID)
	case ModuleWorkouts:
		return s.ExportWorkoutsCSV(ctx, workspaceID)
	case ModuleBodyMetrics:
		return s.ExportBodyMetricsCSV(ctx, workspaceID)
	case ModuleHabits:
		return s.ExportHabitsCSV(ctx, workspaceID)
	case ModulePomodoros:
		return s.ExportPomodorosCSV(ctx, workspaceID)
	case ModuleFitness:
		// The fitness CSV is the exercise library (flat rows); templates/goals/
		// set logs are structured and round-trip through the fitness JSON.
		return s.ExportFitnessCSV(ctx, workspaceID)
	default:
		return "", fmt.Errorf("unknown module %q", module)
	}
}

// ImportModuleCSV imports a module CSV with header-name mapping and per-module
// dedup rules (duplicates are skipped and counted).
func (s *ExportService) ImportModuleCSV(ctx context.Context, userID, workspaceID uint, module, csvString string) (ImportStats, error) {
	switch strings.ToLower(module) {
	case ModuleTodos:
		return s.ImportTodosCSV(ctx, userID, workspaceID, csvString)
	case ModuleContacts:
		return s.ImportContactsCSV(ctx, userID, workspaceID, csvString)
	case ModuleTransactions:
		return s.ImportTransactionsCSV(ctx, userID, workspaceID, csvString)
	case ModuleEvents:
		return s.ImportEventsCSV(ctx, userID, workspaceID, csvString)
	case ModuleTags:
		return s.ImportTagsCSV(ctx, userID, workspaceID, csvString)
	case ModuleInteractions:
		return s.ImportInteractionsCSV(ctx, userID, workspaceID, csvString)
	case ModuleRelations:
		return s.ImportRelationsCSV(ctx, userID, workspaceID, csvString)
	case ModuleReminders:
		return s.ImportRemindersCSV(ctx, userID, workspaceID, csvString)
	case ModuleWorkouts:
		return s.ImportWorkoutsCSV(ctx, userID, workspaceID, csvString)
	case ModuleBodyMetrics:
		return s.ImportBodyMetricsCSV(ctx, userID, workspaceID, csvString)
	case ModuleHabits:
		return s.ImportHabitsCSV(ctx, userID, workspaceID, csvString)
	case ModulePomodoros:
		return s.ImportPomodorosCSV(ctx, userID, workspaceID, csvString)
	case ModuleFitness:
		return s.ImportFitnessCSV(ctx, userID, workspaceID, csvString)
	default:
		return ImportStats{}, fmt.Errorf("unknown module %q", module)
	}
}
