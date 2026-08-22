package repository

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newWorkoutTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Workout{}, &model.WorkoutExercise{}, &model.BodyMetric{}, &model.WorkoutSetLog{}))
	return db
}

func mustCreateWorkout(t *testing.T, repo *WorkoutRepo, ws uint, name string) *model.Workout {
	t.Helper()
	w := &model.Workout{UserID: 1, WorkspaceID: ws, Name: name, Type: "strength", Status: model.WorkoutStatusPlanned}
	require.NoError(t, repo.Create(context.Background(), w))
	return w
}

// --- Exercise count sync mirrors the todo item lifecycle guarantees. ---

func TestWorkoutRepo_ExerciseCounts(t *testing.T) {
	db := newWorkoutTestDB(t)
	wRepo := NewWorkoutRepo(db)
	exRepo := NewWorkoutExerciseRepo(db)
	ctx := context.Background()
	w := mustCreateWorkout(t, wRepo, 1, "leg day")

	a := &model.WorkoutExercise{WorkoutID: w.ID, Name: "squat"}
	b := &model.WorkoutExercise{WorkoutID: w.ID, Name: "lunge"}
	require.NoError(t, exRepo.CreateExercise(ctx, a))
	require.NoError(t, exRepo.CreateExercise(ctx, b))

	parent, err := wRepo.GetByID(ctx, 1, w.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, parent.ItemTotal, "item_total after create")
	assert.Equal(t, 0, parent.ItemDone)

	require.NoError(t, exRepo.SetExerciseDone(ctx, w.ID, a.ID, true))
	parent, _ = wRepo.GetByID(ctx, 1, w.ID)
	assert.Equal(t, 1, parent.ItemDone, "item_done after toggle on")

	require.NoError(t, exRepo.SetExerciseDone(ctx, w.ID, a.ID, false))
	parent, _ = wRepo.GetByID(ctx, 1, w.ID)
	assert.Equal(t, 0, parent.ItemDone, "item_done after toggle off")

	// Deleting a done exercise decrements both counters.
	require.NoError(t, exRepo.SetExerciseDone(ctx, w.ID, b.ID, true))
	require.NoError(t, exRepo.DeleteExercise(ctx, w.ID, b.ID))
	parent, _ = wRepo.GetByID(ctx, 1, w.ID)
	assert.Equal(t, 1, parent.ItemTotal, "item_total after delete")
	assert.Equal(t, 0, parent.ItemDone, "item_done after deleting the only done exercise")
}

func TestWorkoutRepo_CreateExerciseAssignsOrder(t *testing.T) {
	db := newWorkoutTestDB(t)
	wRepo := NewWorkoutRepo(db)
	exRepo := NewWorkoutExerciseRepo(db)
	ctx := context.Background()
	w := mustCreateWorkout(t, wRepo, 1, "cardio")

	a := &model.WorkoutExercise{WorkoutID: w.ID, Name: "run"}
	b := &model.WorkoutExercise{WorkoutID: w.ID, Name: "stretch"}
	require.NoError(t, exRepo.CreateExercise(ctx, a))
	require.NoError(t, exRepo.CreateExercise(ctx, b))
	assert.Equal(t, 0, a.SortOrder)
	assert.Equal(t, 1, b.SortOrder)
}

// --- List filtering ---

func TestWorkoutRepo_ListFilters(t *testing.T) {
	db := newWorkoutTestDB(t)
	repo := NewWorkoutRepo(db)
	ctx := context.Background()
	mustCreateWorkout(t, repo, 1, "push day") // strength, planned

	pull := mustCreateWorkout(t, repo, 1, "pull day")
	pull.Type = "strength"
	pull.Status = model.WorkoutStatusCompleted
	require.NoError(t, repo.Update(ctx, pull))

	run := &model.Workout{UserID: 1, WorkspaceID: 1, Name: "morning run", Type: "cardio", Status: model.WorkoutStatusPlanned}
	require.NoError(t, repo.Create(ctx, run))
	mustCreateWorkout(t, repo, 2, "other ws") // different workspace

	// Filter by status.
	got, total, err := repo.List(ctx, 1, model.WorkoutListQuery{Status: model.WorkoutStatusPlanned})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, got, 2)

	// Filter by type.
	got, total, err = repo.List(ctx, 1, model.WorkoutListQuery{Type: "cardio"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "morning run", got[0].Name)

	// Search by name.
	got, total, err = repo.List(ctx, 1, model.WorkoutListQuery{Search: "PULL"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "pull day", got[0].Name)
}

// --- Stats ---

func TestWorkoutRepo_Stats(t *testing.T) {
	db := newWorkoutTestDB(t)
	repo := NewWorkoutRepo(db)
	ctx := context.Background()

	w1 := mustCreateWorkout(t, repo, 1, "done 1")
	w1.Status = model.WorkoutStatusCompleted
	dur := 45
	cal := 300.0
	w1.DurationMin = &dur
	w1.Calories = &cal
	require.NoError(t, repo.Update(ctx, w1))

	w2 := mustCreateWorkout(t, repo, 1, "done 2")
	w2.Status = model.WorkoutStatusCompleted
	dur2 := 30
	w2.DurationMin = &dur2
	require.NoError(t, repo.Update(ctx, w2))

	mustCreateWorkout(t, repo, 1, "planned 1") // planned

	stats, err := repo.Stats(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(3), stats.Total)
	assert.Equal(t, int64(1), stats.Planned)
	assert.Equal(t, int64(2), stats.Completed)
	assert.Equal(t, int64(75), stats.TotalMinutes, "sum of completed durations")
	assert.Equal(t, 300.0, stats.TotalCalories)
}

// TestWorkoutRepo_Reorder exercises the manual-order renumber path (which now
// uses the shared single-statement CASE update) for the workouts table.
func TestWorkoutRepo_Reorder(t *testing.T) {
	db := newWorkoutTestDB(t)
	repo := NewWorkoutRepo(db)
	ctx := context.Background()
	a := mustCreateWorkout(t, repo, 1, "a")
	mustCreateWorkout(t, repo, 1, "b")
	c := mustCreateWorkout(t, repo, 1, "c")
	mustCreateWorkout(t, repo, 2, "other-ws") // must be untouched

	// Move c to right after a → [a, c, b].
	require.NoError(t, repo.Reorder(ctx, 1, c.ID, &a.ID))
	ws, _, err := repo.List(ctx, 1, model.WorkoutListQuery{Sort: model.WorkoutSortManual})
	require.NoError(t, err)
	require.Len(t, ws, 3)
	assert.Equal(t, []string{"a", "c", "b"}, []string{ws[0].Name, ws[1].Name, ws[2].Name})

	// Move a to the top (afterID nil) → stays first; idempotent.
	require.NoError(t, repo.Reorder(ctx, 1, a.ID, nil))
	ws, _, _ = repo.List(ctx, 1, model.WorkoutListQuery{Sort: model.WorkoutSortManual})
	assert.Equal(t, "a", ws[0].Name)
}

// --- Body metric summary trend ---

func TestBodyMetricRepo_SummaryTrend(t *testing.T) {
	db := newWorkoutTestDB(t)
	repo := NewBodyMetricRepo(db)
	ctx := context.Background()

	weight := func(kg float64) *float64 { return &kg }
	// Ascending recorded_at so the "latest" is the heaviest (up trend).
	t0 := mustRecordMetric(t, repo, 1, "2026-01-01T08:00:00Z", weight(70.0))
	t1 := mustRecordMetric(t, repo, 1, "2026-01-08T08:00:00Z", weight(71.5))
	_ = t0
	_ = t1

	sum, err := repo.Summary(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), sum.Count)
	require.NotNil(t, sum.LatestWeight)
	assert.InDelta(t, 71.5, *sum.LatestWeight, 0.0001)
	require.NotNil(t, sum.PrevWeight)
	assert.InDelta(t, 70.0, *sum.PrevWeight, 0.0001)
	assert.Equal(t, "up", sum.WeightTrend)
}

func mustRecordMetric(t *testing.T, repo *BodyMetricRepo, ws uint, at string, weight *float64) *model.BodyMetric {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, at)
	require.NoError(t, err)
	m := &model.BodyMetric{UserID: 1, WorkspaceID: ws, RecordedAt: ts, Weight: weight}
	require.NoError(t, repo.Create(context.Background(), m))
	return m
}
