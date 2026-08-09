package service

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newWorkoutSvcTestDB(t *testing.T) (*WorkoutService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Workout{}, &model.WorkoutExercise{}, &model.BodyMetric{}))
	svc := NewWorkoutService(repository.NewWorkoutRepo(db), repository.NewWorkoutExerciseRepo(db), repository.NewBodyMetricRepo(db))
	return svc, db
}

// Update applies non-empty fields and honours clear flags for nullable values.
func TestWorkoutService_UpdateClearFlags(t *testing.T) {
	svc, _ := newWorkoutSvcTestDB(t)
	ctx := context.Background()

	at, _ := time.Parse(time.RFC3339, "2026-08-04T19:00:00Z")
	w, err := svc.Create(ctx, 1, 1, &model.Workout{Name: "run", ScheduledAt: &at, Calories: floatPtr(300)})
	require.NoError(t, err)
	require.NotNil(t, w.ScheduledAt)

	// Clear scheduled_at via flag; leave calories untouched (no value, no flag).
	updated, err := svc.Update(ctx, 1, 1, w.ID, &model.Workout{Name: "morning run"}, WorkoutClear{ScheduledAt: true})
	require.NoError(t, err)
	assert.Equal(t, "morning run", updated.Name)
	assert.Nil(t, updated.ScheduledAt, "scheduled_at cleared by flag")
	require.NotNil(t, updated.Calories, "calories left intact")
	assert.InDelta(t, 300, *updated.Calories, 0.0001)
}

// ToggleStatus flips completion and stamps/clears CompletedAt.
func TestWorkoutService_ToggleStatus(t *testing.T) {
	svc, _ := newWorkoutSvcTestDB(t)
	ctx := context.Background()
	w, err := svc.Create(ctx, 1, 1, &model.Workout{Name: "lift"})
	require.NoError(t, err)

	done, err := svc.ToggleStatus(ctx, 1, 1, w.ID)
	require.NoError(t, err)
	assert.Equal(t, model.WorkoutStatusCompleted, done.Status)
	require.NotNil(t, done.CompletedAt)

	undone, err := svc.ToggleStatus(ctx, 1, 1, w.ID)
	require.NoError(t, err)
	assert.Equal(t, model.WorkoutStatusPlanned, undone.Status)
	assert.Nil(t, undone.CompletedAt)
}

// Exercise lifecycle through the service, including ownership scoping.
func TestWorkoutService_ExerciseLifecycle(t *testing.T) {
	svc, _ := newWorkoutSvcTestDB(t)
	ctx := context.Background()
	w, err := svc.Create(ctx, 1, 1, &model.Workout{Name: "push"})
	require.NoError(t, err)

	// Empty name is rejected.
	_, err = svc.CreateExercise(ctx, 1, 1, w.ID, &model.WorkoutExercise{Name: "  "})
	assert.ErrorIs(t, err, ErrExerciseEmpty)

	ex, err := svc.CreateExercise(ctx, 1, 1, w.ID, &model.WorkoutExercise{Name: "bench"})
	require.NoError(t, err)

	toggled, err := svc.ToggleExercise(ctx, 1, 1, w.ID, ex.ID)
	require.NoError(t, err)
	assert.True(t, toggled.Done)

	// Exercise under a missing workout is NotFound.
	_, err = svc.CreateExercise(ctx, 1, 1, 9999, &model.WorkoutExercise{Name: "x"})
	assert.ErrorIs(t, err, ErrWorkoutNotFound)

	require.NoError(t, svc.DeleteExercise(ctx, 1, 1, w.ID, ex.ID))
	_, err = svc.ToggleExercise(ctx, 1, 1, w.ID, ex.ID)
	assert.ErrorIs(t, err, ErrExerciseNotFound)
}

// Body metric create/list/summary round-trip.
func TestWorkoutService_BodyMetricFlow(t *testing.T) {
	svc, _ := newWorkoutSvcTestDB(t)
	ctx := context.Background()

	t0, _ := time.Parse(time.RFC3339, "2026-07-01T08:00:00Z")
	t1, _ := time.Parse(time.RFC3339, "2026-07-08T08:00:00Z")
	_, err := svc.CreateMetric(ctx, 1, 1, &model.BodyMetric{RecordedAt: t0, Weight: floatPtr(70.0), Height: floatPtr(175)})
	require.NoError(t, err)
	_, err = svc.CreateMetric(ctx, 1, 1, &model.BodyMetric{RecordedAt: t1, Weight: floatPtr(69.0), Height: floatPtr(175)})
	require.NoError(t, err)

	metrics, total, err := svc.ListMetrics(ctx, 1, 1, 1, 50)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, metrics, 2)
	assert.True(t, metrics[0].RecordedAt.After(metrics[1].RecordedAt), "newest first")

	sum, err := svc.BodySummary(ctx, 1, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), sum.Count)
	assert.Equal(t, "down", sum.WeightTrend)
}

// CreateMetric defaults RecordedAt to now when omitted.
func TestWorkoutService_CreateMetricDefaultsTime(t *testing.T) {
	svc, _ := newWorkoutSvcTestDB(t)
	ctx := context.Background()
	m, err := svc.CreateMetric(ctx, 1, 1, &model.BodyMetric{Weight: floatPtr(70)})
	require.NoError(t, err)
	assert.False(t, m.RecordedAt.IsZero())
}

// floatPtr is a tiny helper for pointer literals in tests.
func floatPtr(v float64) *float64 { return &v }
