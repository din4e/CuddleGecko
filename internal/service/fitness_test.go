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

func newFitnessSvcTestDB(t *testing.T) (*FitnessService, *WorkoutService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Workout{}, &model.WorkoutExercise{}, &model.BodyMetric{},
		&model.ExerciseLibraryItem{}, &model.WorkoutTemplate{}, &model.WorkoutTemplateItem{},
		&model.WorkoutSetLog{}, &model.FitnessGoal{},
	))
	workoutSvc := NewWorkoutService(repository.NewWorkoutRepo(db), repository.NewWorkoutExerciseRepo(db), repository.NewBodyMetricRepo(db))
	svc := NewFitnessService(
		repository.NewExerciseLibraryRepo(db),
		repository.NewWorkoutTemplateRepo(db),
		repository.NewWorkoutSetLogRepo(db),
		repository.NewFitnessGoalRepo(db),
		workoutSvc,
	)
	return svc, workoutSvc, db
}

func intPtr(v int) *int { return &v }

// Library rejects duplicates within a workspace but allows them across workspaces.
func TestFitnessService_LibraryDuplicate(t *testing.T) {
	svc, _, _ := newFitnessSvcTestDB(t)
	ctx := context.Background()

	_, err := svc.CreateLibraryItem(ctx, 1, 1, &model.ExerciseLibraryItem{Name: "Bench Press"})
	require.NoError(t, err)

	_, err = svc.CreateLibraryItem(ctx, 1, 1, &model.ExerciseLibraryItem{Name: "bench press"})
	assert.ErrorIs(t, err, ErrLibraryDuplicate)

	_, err = svc.CreateLibraryItem(ctx, 1, 2, &model.ExerciseLibraryItem{Name: "bench press"})
	assert.NoError(t, err, "different workspace allows same name")

	_, err = svc.CreateLibraryItem(ctx, 1, 1, &model.ExerciseLibraryItem{Name: "  "})
	assert.ErrorIs(t, err, ErrLibraryItemEmpty)
}

// Template create → instantiate produces a planned workout with exercises.
func TestFitnessService_TemplateInstantiate(t *testing.T) {
	svc, workoutSvc, _ := newFitnessSvcTestDB(t)
	ctx := context.Background()

	tpl, err := svc.CreateTemplate(ctx, 1, 1, &model.WorkoutTemplate{
		Name: "Push Day",
		Type: "strength",
		Items: []model.WorkoutTemplateItem{
			{Name: "Bench Press", Sets: intPtr(4), Reps: intPtr(8)},
			{Name: "  ", Sets: intPtr(1)}, // blank item dropped
			{Name: "Dips", Sets: intPtr(3), Reps: intPtr(10)},
		},
	})
	require.NoError(t, err)
	assert.Len(t, tpl.Items, 2, "blank-named items dropped")
	assert.Equal(t, "strength", tpl.Type)

	at, _ := time.Parse(time.RFC3339, "2026-08-24T07:30:00Z")
	w, err := svc.InstantiateTemplate(ctx, 1, 1, tpl.ID, &at)
	require.NoError(t, err)
	assert.Equal(t, "Push Day", w.Name)
	assert.Equal(t, model.WorkoutStatusPlanned, w.Status)
	assert.Equal(t, 2, w.ItemTotal)

	exercises, err := workoutSvc.ListExercises(ctx, 1, 1, w.ID)
	require.NoError(t, err)
	assert.Len(t, exercises, 2)
	assert.Equal(t, "Bench Press", exercises[0].Name)
}

// Set-log lifecycle + PR derivation (best weight, Epley e1RM).
func TestFitnessService_SetLogsAndPRs(t *testing.T) {
	svc, workoutSvc, _ := newFitnessSvcTestDB(t)
	ctx := context.Background()

	w, err := workoutSvc.Create(ctx, 1, 1, &model.Workout{Name: "legs"})
	require.NoError(t, err)
	ex, err := workoutSvc.CreateExercise(ctx, 1, 1, w.ID, &model.WorkoutExercise{Name: "Squat"})
	require.NoError(t, err)

	log1, err := svc.CreateSetLog(ctx, 1, 1, w.ID, ex.ID, &model.WorkoutSetLog{Reps: intPtr(5), Weight: floatPtr(100)})
	require.NoError(t, err)
	assert.Equal(t, 1, log1.SetIndex, "set index auto-assigned")

	_, err = svc.CreateSetLog(ctx, 1, 1, w.ID, ex.ID, &model.WorkoutSetLog{Reps: intPtr(8), Weight: floatPtr(80)})
	require.NoError(t, err)

	logs, err := svc.ListSetLogs(ctx, 1, 1, w.ID, ex.ID)
	require.NoError(t, err)
	assert.Len(t, logs, 2)

	prs, err := svc.PRs(ctx, 1, 1)
	require.NoError(t, err)
	require.Len(t, prs, 1)
	assert.Equal(t, "Squat", prs[0].Exercise)
	assert.InDelta(t, 100, prs[0].BestWeight, 0.0001)
	// Epley: 80 * (1 + 8/30) = 101.33 beats 100 * (1 + 5/30) = 116.67? No:
	// 100*(1+5/30)=116.67 > 80*(1+8/30)=101.33.
	assert.InDelta(t, 116.67, prs[0].BestE1RM, 0.01)

	err = svc.DeleteSetLog(ctx, 1, 1, w.ID, ex.ID, log1.ID)
	require.NoError(t, err)
	logs, err = svc.ListSetLogs(ctx, 1, 1, w.ID, ex.ID)
	require.NoError(t, err)
	assert.Len(t, logs, 1)
}

// Goal validation + computed progress (weekly count and latest weight).
func TestFitnessService_Goals(t *testing.T) {
	svc, workoutSvc, _ := newFitnessSvcTestDB(t)
	ctx := context.Background()

	_, err := svc.CreateGoal(ctx, 1, 1, &model.FitnessGoal{Type: "bogus", TargetValue: 3})
	assert.ErrorIs(t, err, ErrGoalInvalid)

	goal, err := svc.CreateGoal(ctx, 1, 1, &model.FitnessGoal{Type: model.FitnessGoalWeeklyWorkouts, TargetValue: 3})
	require.NoError(t, err)
	require.NotNil(t, goal.CurrentValue)
	assert.InDelta(t, 0, *goal.CurrentValue, 0.0001)

	w, err := workoutSvc.Create(ctx, 1, 1, &model.Workout{Name: "run"})
	require.NoError(t, err)
	_, err = workoutSvc.ToggleStatus(ctx, 1, 1, w.ID)
	require.NoError(t, err)

	goals, err := svc.ListGoals(ctx, 1, 1)
	require.NoError(t, err)
	require.Len(t, goals, 1)
	assert.InDelta(t, 1, *goals[0].CurrentValue, 0.0001, "this week's completion counted")

	_, err = workoutSvc.CreateMetric(ctx, 1, 1, &model.BodyMetric{Weight: floatPtr(70.5)})
	require.NoError(t, err)
	wGoal, err := svc.CreateGoal(ctx, 1, 1, &model.FitnessGoal{Type: model.FitnessGoalWeightTarget, TargetValue: 68})
	require.NoError(t, err)
	require.NotNil(t, wGoal.CurrentValue)
	assert.InDelta(t, 70.5, *wGoal.CurrentValue, 0.0001)
}

// History buckets completed workouts per ISO week and Stats reports the streak.
func TestFitnessService_HistoryAndStreak(t *testing.T) {
	_, workoutSvc, db := newFitnessSvcTestDB(t)
	ctx := context.Background()

	now := time.Now()
	daysAgo := func(d int) *time.Time {
		t := now.AddDate(0, 0, -d)
		return &t
	}
	// One completion every 7 days: each timestamp is exactly one ISO week back
	// from the previous, guaranteeing 4 consecutive populated weeks.
	for _, d := range []int{1, 8, 15, 22} {
		w, err := workoutSvc.Create(ctx, 1, 1, &model.Workout{Name: "run", ScheduledAt: daysAgo(d), DurationMin: intPtr(30)})
		require.NoError(t, err)
		_, err = workoutSvc.ToggleStatus(ctx, 1, 1, w.ID)
		require.NoError(t, err)
		// Toggle stamps completed_at = now; backdate it so the streak sees
		// four distinct weeks.
		require.NoError(t, db.Model(&model.Workout{}).Where("id = ?", w.ID).
			Update("completed_at", daysAgo(d)).Error)
	}

	stats, err := workoutSvc.Stats(ctx, 1, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(4), stats.Completed)
	assert.GreaterOrEqual(t, stats.StreakWeeks, 4)

	buckets, err := workoutSvc.History(ctx, 1, 1, "week", 12)
	require.NoError(t, err)
	assert.NotEmpty(t, buckets)
	var total int64
	for _, b := range buckets {
		total += b.Count
	}
	assert.Equal(t, int64(4), total)
}

// Metric list date filtering (used by the chart range selector).
func TestFitnessService_MetricDateFilter(t *testing.T) {
	_, workoutSvc, _ := newFitnessSvcTestDB(t)
	ctx := context.Background()

	old, _ := time.Parse(time.RFC3339, "2025-01-01T00:00:00Z")
	recent := time.Now()
	_, err := workoutSvc.CreateMetric(ctx, 1, 1, &model.BodyMetric{RecordedAt: old, Weight: floatPtr(80)})
	require.NoError(t, err)
	_, err = workoutSvc.CreateMetric(ctx, 1, 1, &model.BodyMetric{RecordedAt: recent, Weight: floatPtr(70)})
	require.NoError(t, err)

	metrics, total, err := workoutSvc.ListMetrics(ctx, 1, 1, model.BodyMetricListQuery{
		DateAfter: &[]time.Time{old.AddDate(0, 0, 1)}[0], Page: 1, PageSize: 100,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, metrics, 1)
	assert.InDelta(t, 70, *metrics[0].Weight, 0.0001)
}
