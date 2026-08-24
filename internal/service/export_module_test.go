package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newModuleTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Contact{}, &model.Tag{}, &model.Tagging{}, &model.Interaction{}, &model.Reminder{},
		&model.ContactRelation{}, &model.Todo{}, &model.TodoItem{}, &model.Transaction{}, &model.Event{},
		&model.Workout{}, &model.WorkoutExercise{}, &model.BodyMetric{},
		&model.Habit{}, &model.HabitLog{}, &model.PomodoroSession{},
		&model.ExerciseLibraryItem{}, &model.WorkoutTemplate{}, &model.WorkoutTemplateItem{},
		&model.WorkoutSetLog{}, &model.FitnessGoal{},
	))
	return db
}

func newModuleService(t *testing.T) (*ExportService, map[string]interface{}, *gorm.DB) {
	t.Helper()
	db := newModuleTestDB(t)
	todoRepo := repository.NewTodoRepo(db)
	workoutRepo := repository.NewWorkoutRepo(db)
	workoutExRepo := repository.NewWorkoutExerciseRepo(db)
	habitRepo := repository.NewHabitRepo(db)
	habitLogRepo := repository.NewHabitLogRepo(db)
	pomodoroRepo := repository.NewPomodoroRepo(db)
	exLibRepo := repository.NewExerciseLibraryRepo(db)
	tplRepo := repository.NewWorkoutTemplateRepo(db)
	setLogRepo := repository.NewWorkoutSetLogRepo(db)
	goalRepo := repository.NewFitnessGoalRepo(db)
	svc := NewExportService(
		repository.NewContactRepo(db), repository.NewTagRepo(db),
		repository.NewInteractionRepo(db), repository.NewReminderRepo(db),
		repository.NewRelationRepo(db), todoRepo, todoRepo,
		WithWorkoutRepos(workoutRepo, workoutExRepo, repository.NewBodyMetricRepo(db)),
		WithHabitRepos(habitRepo, habitLogRepo),
		WithPomodoroRepo(pomodoroRepo),
		WithFitnessRepos(exLibRepo, tplRepo, setLogRepo, goalRepo),
	)
	return svc, map[string]interface{}{
		"todo": todoRepo, "habit": habitRepo, "habitLog": habitLogRepo,
		"pomodoro": pomodoroRepo, "exLib": exLibRepo, "tpl": tplRepo,
		"setLog": setLogRepo, "goal": goalRepo, "workout": workoutRepo,
		"workoutEx": workoutExRepo,
	}, db
}

// TestModule_TagsCSVDedup: importing the same tags CSV twice skips duplicates.
func TestModule_TagsCSVDedup(t *testing.T) {
	svc, _, _ := newModuleService(t)
	ctx := context.Background()
	csv := "name,color\nwork,#ff0000\nfamily,#00ff00\n"
	first, err := svc.ImportModuleCSV(ctx, 1, 1, ModuleTags, csv)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 2}, first)

	second, err := svc.ImportModuleCSV(ctx, 1, 1, ModuleTags, csv)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 0, Skipped: 2}, second, "duplicates skipped on re-import")
}

// TestModule_HabitsCSVRoundTrip: habits + check-in history survive a CSV
// export → import round-trip into a fresh workspace.
func TestModule_HabitsCSVRoundTrip(t *testing.T) {
	svc, repos, _ := newModuleService(t)
	habitRepo := repos["habit"].(HabitRepository)
	logRepo := repos["habitLog"].(HabitLogRepository)
	ctx := context.Background()

	require.NoError(t, habitRepo.Create(ctx, &model.Habit{UserID: 1, WorkspaceID: 1, Name: "阅读", Emoji: "📚", Frequency: "daily"}))
	habits, err := habitRepo.List(ctx, 1, false)
	require.NoError(t, err)
	_, err = logRepo.Toggle(ctx, 1, 1, habits[0].ID, "2026-08-01")
	require.NoError(t, err)
	_, err = logRepo.Toggle(ctx, 1, 1, habits[0].ID, "2026-08-02")
	require.NoError(t, err)

	out, err := svc.ExportModuleCSV(ctx, 1, ModuleHabits)
	require.NoError(t, err)

	stats, err := svc.ImportModuleCSV(ctx, 2, 2, ModuleHabits, out)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 1}, stats)

	imported, err := habitRepo.List(ctx, 2, true)
	require.NoError(t, err)
	require.Len(t, imported, 1)
	assert.Equal(t, "阅读", imported[0].Name)
	logs, err := logRepo.ListAllByWorkspace(ctx, 2)
	require.NoError(t, err)
	assert.Len(t, logs, 2, "check-in history rides along")
}

// TestModule_WorkoutsCSVRoundTrip: workouts with inline exercises round-trip
// through CSV.
func TestModule_WorkoutsCSVRoundTrip(t *testing.T) {
	svc, _, _ := newModuleService(t)
	ctx := context.Background()

	in := "name,type,status,scheduled_at,exercises\n" +
		"Push Day,strength,completed,2026-08-01T10:00:00Z," +
		"Bench|strength|3|5|80||||true; " +
		"Run|cardio|||||10|0|false\n"
	stats, err := svc.ImportModuleCSV(ctx, 1, 1, ModuleWorkouts, in)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 1}, stats)

	// Re-import of the exported file is fully deduped.
	out, err := svc.ExportModuleCSV(ctx, 1, ModuleWorkouts)
	require.NoError(t, err)
	assert.Contains(t, out, "Bench|strength|3|5|80")
	stats2, err := svc.ImportModuleCSV(ctx, 1, 1, ModuleWorkouts, out)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 0, Skipped: 1}, stats2)
}

// TestModule_JSONRoundTrip: a habits module JSON exported from workspace 1
// imports into workspace 2 with history intact.
func TestModule_JSONRoundTrip(t *testing.T) {
	svc, repos, _ := newModuleService(t)
	habitRepo := repos["habit"].(HabitRepository)
	logRepo := repos["habitLog"].(HabitLogRepository)
	ctx := context.Background()

	require.NoError(t, habitRepo.Create(ctx, &model.Habit{UserID: 1, WorkspaceID: 1, Name: "跑步", Frequency: "daily"}))
	habits, err := habitRepo.List(ctx, 1, false)
	require.NoError(t, err)
	_, err = logRepo.Toggle(ctx, 1, 1, habits[0].ID, "2026-08-10")
	require.NoError(t, err)

	out, err := svc.ExportModuleJSON(ctx, 1, 1, ModuleHabits)
	require.NoError(t, err)

	var doc ExportData
	require.NoError(t, json.Unmarshal([]byte(out), &doc))
	require.Len(t, doc.Data.Habits, 1)
	require.Len(t, doc.Data.Habits[0].CheckinDates, 1)

	stats, err := svc.ImportModuleJSON(ctx, 2, 2, ModuleHabits, out)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 1}, stats)

	imported, err := habitRepo.List(ctx, 2, true)
	require.NoError(t, err)
	require.Len(t, imported, 1)
	logs, err := logRepo.ListAllByWorkspace(ctx, 2)
	require.NoError(t, err)
	assert.Len(t, logs, 1)
}

// TestModule_FitnessJSONRoundTrip: the composite fitness module (workouts +
// set logs + library + templates + goals) round-trips with id remapping.
func TestModule_FitnessJSONRoundTrip(t *testing.T) {
	svc, repos, _ := newModuleService(t)
	workoutRepo := repos["workout"].(WorkoutRepository)
	workoutExRepo := repos["workoutEx"].(WorkoutExerciseRepository)
	setLogRepo := repos["setLog"].(WorkoutSetLogRepository)
	exLibRepo := repos["exLib"].(ExerciseLibraryRepository)
	goalRepo := repos["goal"].(FitnessGoalRepository)
	ctx := context.Background()

	// Seed ws 1: a workout with an exercise + set log, a library item, a goal.
	w := &model.Workout{UserID: 1, WorkspaceID: 1, Name: "Leg Day", Type: "strength", Status: model.WorkoutStatusCompleted}
	require.NoError(t, workoutRepo.Create(ctx, w))
	ex := &model.WorkoutExercise{WorkoutID: w.ID, Name: "Squat", Category: "strength", Sets: ptrInt(3), Reps: ptrInt(5), Weight: ptrFloat(100)}
	require.NoError(t, workoutExRepo.CreateExercise(ctx, ex))
	require.NoError(t, setLogRepo.Create(ctx, &model.WorkoutSetLog{WorkoutID: w.ID, ExerciseID: ex.ID, SetIndex: 0, Reps: ptrInt(5), Weight: ptrFloat(100), Done: true}))
	require.NoError(t, exLibRepo.Create(ctx, &model.ExerciseLibraryItem{UserID: 1, WorkspaceID: 1, Name: "Squat", Category: "strength"}))
	require.NoError(t, goalRepo.Create(ctx, &model.FitnessGoal{UserID: 1, WorkspaceID: 1, Type: model.FitnessGoalWeeklyWorkouts, TargetValue: 3}))

	out, err := svc.ExportModuleJSON(ctx, 1, 1, ModuleFitness)
	require.NoError(t, err)

	var doc ExportData
	require.NoError(t, json.Unmarshal([]byte(out), &doc))
	require.Len(t, doc.Data.Workouts, 1)
	require.Len(t, doc.Data.Workouts[0].Exercises, 1)
	require.Len(t, doc.Data.SetLogs, 1)
	require.Len(t, doc.Data.ExerciseLibrary, 1)
	require.Len(t, doc.Data.FitnessGoals, 1)

	stats, err := svc.ImportModuleJSON(ctx, 2, 2, ModuleFitness, out)
	require.NoError(t, err)
	assert.Equal(t, 4, stats.Imported)

	// Set log remapped onto the freshly-created workout + exercise.
	imported, _, err := workoutRepo.List(ctx, 2, model.WorkoutListQuery{Page: 1, PageSize: 100})
	require.NoError(t, err)
	require.Len(t, imported, 1)
	exs, err := workoutExRepo.ListExercises(ctx, imported[0].ID)
	require.NoError(t, err)
	require.Len(t, exs, 1)
	logs, err := setLogRepo.ListByExercise(ctx, imported[0].ID, exs[0].ID)
	require.NoError(t, err)
	require.Len(t, logs, 1, "set log follows its remapped workout/exercise")
	assert.Equal(t, ptrFloat(100), logs[0].Weight)

	lib, err := exLibRepo.List(ctx, 2, "")
	require.NoError(t, err)
	require.Len(t, lib, 1)
	goals, err := goalRepo.List(ctx, 2)
	require.NoError(t, err)
	require.Len(t, goals, 1)
}

func ptrInt(v int) *int       { return &v }
func ptrFloat(v float64) *float64 { return &v }

// TestModule_UnknownModule: unknown module names are rejected.
func TestModule_UnknownModule(t *testing.T) {
	svc, _, _ := newModuleService(t)
	ctx := context.Background()
	_, err := svc.ExportModuleCSV(ctx, 1, "nope")
	assert.Error(t, err)
	_, err = svc.ImportModuleCSV(ctx, 1, 1, "nope", "a,b\n")
	assert.Error(t, err)
}

// TestModule_BodyMetricsDedup: identical recorded_at rows are skipped.
func TestModule_BodyMetricsDedup(t *testing.T) {
	svc, _, _ := newModuleService(t)
	ctx := context.Background()
	csv := "recorded_at,weight\n2026-08-01T08:00:00Z,70.5\n"
	first, err := svc.ImportModuleCSV(ctx, 1, 1, ModuleBodyMetrics, csv)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 1}, first)
	second, err := svc.ImportModuleCSV(ctx, 1, 1, ModuleBodyMetrics, csv)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 0, Skipped: 1}, second)
}

// TestModule_PomodorosCSV: pomodoro sessions import with dedup.
func TestModule_PomodorosCSV(t *testing.T) {
	svc, _, _ := newModuleService(t)
	ctx := context.Background()
	at := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)
	csv := "kind,duration_seconds,completed,started_at,ended_at\n" +
		"focus,1500,true," + at.Format(time.RFC3339) + "," + at.Add(25*time.Minute).Format(time.RFC3339) + "\n"
	first, err := svc.ImportModuleCSV(ctx, 1, 1, ModulePomodoros, csv)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 1}, first)
	second, err := svc.ImportModuleCSV(ctx, 1, 1, ModulePomodoros, csv)
	require.NoError(t, err)
	assert.Equal(t, ImportStats{Imported: 0, Skipped: 1}, second)
}
