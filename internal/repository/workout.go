package repository

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// -------------------------------------------------------------------
// Workout
// -------------------------------------------------------------------

type WorkoutRepo struct {
	db *gorm.DB
}

func NewWorkoutRepo(db *gorm.DB) *WorkoutRepo {
	return &WorkoutRepo{db: db}
}

func (r *WorkoutRepo) Create(ctx context.Context, w *model.Workout) error {
	if err := r.db.WithContext(ctx).Create(w).Error; err != nil {
		return fmt.Errorf("create workout: %w", err)
	}
	return nil
}

func (r *WorkoutRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Workout, error) {
	var w model.Workout
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&w).Error; err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *WorkoutRepo) List(ctx context.Context, workspaceID uint, q model.WorkoutListQuery) ([]model.Workout, int64, error) {
	q.Page, q.PageSize = clampPage(q.Page, q.PageSize)

	query := r.db.WithContext(ctx).Model(&model.Workout{}).Where("workspace_id = ?", workspaceID)

	if q.Status != "" {
		query = query.Where("status = ?", q.Status)
	}
	if q.Type != "" {
		query = query.Where("type = ?", q.Type)
	}
	if q.Search != "" {
		query = query.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(q.Search)+"%")
	}
	if q.DateAfter != nil {
		query = query.Where("scheduled_at >= ?", *q.DateAfter)
	}
	if q.DateBefore != nil {
		query = query.Where("scheduled_at <= ?", *q.DateBefore)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count workouts: %w", err)
	}

	var workouts []model.Workout
	offset := (q.Page - 1) * q.PageSize
	if err := query.Order(workoutOrderClause(q.Sort, q.Order)).
		Limit(q.PageSize).Offset(offset).
		Find(&workouts).Error; err != nil {
		return nil, 0, fmt.Errorf("list workouts: %w", err)
	}
	return workouts, total, nil
}

// workoutOrderClause builds the ORDER BY clause. Active workouts surface before
// completed/skipped ones; within that, the requested sort key applies.
func workoutOrderClause(sort, order string) string {
	dir := "ASC"
	if strings.EqualFold(order, "desc") {
		dir = "DESC"
	}

	const (
		completedLast    = "CASE WHEN status IN ('completed','skipped') THEN 1 ELSE 0 END"
		scheduledNullsLast = "scheduled_at IS NULL"
		createdTie       = "id DESC"
	)

	switch sort {
	case model.WorkoutSortManual:
		return "sort_order ASC, id ASC"
	case model.WorkoutSortCreated:
		return completedLast + ", created_at " + dir + ", " + createdTie
	default: // WorkoutSortScheduled
		return completedLast + ", " + scheduledNullsLast + ", scheduled_at " + dir + ", " + createdTie
	}
}

func (r *WorkoutRepo) Update(ctx context.Context, w *model.Workout) error {
	if err := r.db.WithContext(ctx).Model(&model.Workout{ID: w.ID}).
		Select("name", "type", "status", "intensity", "scheduled_at", "duration_min", "calories", "color", "location", "notes", "completed_at").
		Updates(w).Error; err != nil {
		return fmt.Errorf("update workout: %w", err)
	}
	return nil
}

// CreateWithExercises creates a workout and its exercise checklist in one
// transaction, used by template instantiation.
func (r *WorkoutRepo) CreateWithExercises(ctx context.Context, w *model.Workout, exercises []model.WorkoutExercise) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(w).Error; err != nil {
			return fmt.Errorf("create workout: %w", err)
		}
		for i := range exercises {
			exercises[i].ID = 0
			exercises[i].WorkoutID = w.ID
			exercises[i].SortOrder = i + 1
			if err := tx.Create(&exercises[i]).Error; err != nil {
				return fmt.Errorf("create workout exercise: %w", err)
			}
		}
		w.ItemTotal = len(exercises)
		w.ItemDone = 0
		return nil
	})
}

// Delete soft-deletes a workout along with its exercises and set logs.
func (r *WorkoutRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("workout_id = ?", id).Delete(&model.WorkoutExercise{}).Error; err != nil {
			return fmt.Errorf("delete workout exercises: %w", err)
		}
		if err := tx.Where("workout_id = ?", id).Delete(&model.WorkoutSetLog{}).Error; err != nil {
			return fmt.Errorf("delete workout set logs: %w", err)
		}
		res := tx.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Workout{})
		if res.Error != nil {
			return fmt.Errorf("delete workout: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

// Reorder moves a workout within the workspace's manual order, after the workout
// with afterID (or to the top when nil). The whole list is renumbered in one tx.
func (r *WorkoutRepo) Reorder(ctx context.Context, workspaceID, id uint, afterID *uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var all []model.Workout
		if err := tx.Where("workspace_id = ?", workspaceID).
			Order("sort_order ASC, id ASC").Find(&all).Error; err != nil {
			return fmt.Errorf("load workouts for reorder: %w", err)
		}

		movedIdx := -1
		rest := make([]model.Workout, 0, len(all))
		for i, t := range all {
			if t.ID == id {
				movedIdx = i
				continue
			}
			rest = append(rest, t)
		}
		if movedIdx == -1 {
			return nil
		}

		insertAt := 0
		if afterID != nil {
			for i, t := range rest {
				if t.ID == *afterID {
					insertAt = i + 1
					break
				}
			}
		}

		ordered := make([]model.Workout, 0, len(rest)+1)
		ordered = append(ordered, rest[:insertAt]...)
		ordered = append(ordered, all[movedIdx])
		ordered = append(ordered, rest[insertAt:]...)

		ids := make([]uint, len(ordered))
		for i, t := range ordered {
			ids[i] = t.ID
		}
		if err := renumberSortOrder(tx, &model.Workout{}, ids); err != nil {
			return fmt.Errorf("renumber workout order: %w", err)
		}
		return nil
	})
}

// Stats computes a fitness overview for the workspace.
func (r *WorkoutRepo) Stats(ctx context.Context, workspaceID uint) (model.WorkoutStats, error) {
	now := time.Now()
	startToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	daysSinceMonday := int(now.Weekday()) - int(time.Monday)
	if daysSinceMonday < 0 {
		daysSinceMonday += 7
	}
	startWeek := startToday.AddDate(0, 0, -daysSinceMonday)

	// Single-pass conditional aggregation: one scan of the workspace's workouts
	// yields every status count plus the completed duration/calories totals,
	// replacing seven sequential round-trips (six COUNTs + a SUM) that — on the
	// single-connection SQLite pool — serialized on every dashboard load.
	var stats model.WorkoutStats
	var row struct {
		Total         int64   `gorm:"column:total"`
		Planned       int64   `gorm:"column:planned"`
		InProgress    int64   `gorm:"column:in_progress"`
		Completed     int64   `gorm:"column:completed"`
		Skipped       int64   `gorm:"column:skipped"`
		ThisWeek      int64   `gorm:"column:this_week"`
		TotalMinutes  int64   `gorm:"column:total_minutes"`
		TotalCalories float64 `gorm:"column:total_calories"`
	}
	if err := r.db.WithContext(ctx).Model(&model.Workout{}).
		Where("workspace_id = ?", workspaceID).
		Select("COUNT(*) AS total, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS planned, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS in_progress, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS completed, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS skipped, "+
			"COALESCE(SUM(CASE WHEN status = ? AND completed_at >= ? THEN 1 ELSE 0 END), 0) AS this_week, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN duration_min ELSE 0 END), 0) AS total_minutes, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN calories ELSE 0 END), 0) AS total_calories",
			model.WorkoutStatusPlanned,
			model.WorkoutStatusInProgress,
			model.WorkoutStatusCompleted,
			model.WorkoutStatusSkipped,
			model.WorkoutStatusCompleted, startWeek,
			model.WorkoutStatusCompleted,
			model.WorkoutStatusCompleted,
		).
		Scan(&row).Error; err != nil {
		return stats, fmt.Errorf("workout stats: %w", err)
	}
	stats.Total = row.Total
	stats.Planned = row.Planned
	stats.InProgress = row.InProgress
	stats.Completed = row.Completed
	stats.Skipped = row.Skipped
	stats.ThisWeek = row.ThisWeek
	stats.TotalMinutes = row.TotalMinutes
	stats.TotalCalories = row.TotalCalories

	// Streak: one query for completion timestamps, consecutive-week math in Go.
	var times []time.Time
	if err := r.db.WithContext(ctx).Model(&model.Workout{}).
		Where("workspace_id = ? AND status = ? AND completed_at IS NOT NULL", workspaceID, model.WorkoutStatusCompleted).
		Order("completed_at DESC").Limit(10000).
		Pluck("completed_at", &times).Error; err != nil {
		return stats, fmt.Errorf("workout streak times: %w", err)
	}
	stats.StreakWeeks = streakWeeks(times, time.Now())
	return stats, nil
}

// streakWeeks counts consecutive weeks (ISO weeks, Monday-based) that each
// contain at least one completion, counting back from the current week. If the
// current week has no completion yet, the streak may still be alive from last
// week, so counting starts there.
func streakWeeks(times []time.Time, now time.Time) int {
	weeks := make(map[string]bool, len(times))
	for _, t := range times {
		y, w := t.ISOWeek()
		weeks[isoWeekKey(y, w)] = true
	}

	y, w := now.ISOWeek()
	streak := 0
	if !weeks[isoWeekKey(y, w)] {
		// Current week still open — fall back to last week without breaking.
		now = now.AddDate(0, 0, -7)
		y, w = now.ISOWeek()
		if !weeks[isoWeekKey(y, w)] {
			return 0
		}
	}
	for {
		if !weeks[isoWeekKey(y, w)] {
			break
		}
		streak++
		now = now.AddDate(0, 0, -7)
		y, w = now.ISOWeek()
	}
	return streak
}

func isoWeekKey(year, week int) string {
	return fmt.Sprintf("%04d-W%02d", year, week)
}

// History aggregates completed workouts per ISO week ("2026-W33") or month
// ("2026-08"). One query fetches the raw rows; bucketing happens in Go so the
// grouping works identically on SQLite and MySQL (no dialect-specific date
// formatting in GROUP BY).
func (r *WorkoutRepo) History(ctx context.Context, workspaceID uint, bucket string, limit int) ([]model.WorkoutHistoryBucket, error) {
	if limit <= 0 {
		limit = 12
	}
	if limit > 104 {
		limit = 104
	}

	var rows []model.Workout
	if err := r.db.WithContext(ctx).Model(&model.Workout{}).
		Select("scheduled_at", "duration_min", "calories").
		Where("workspace_id = ? AND status = ? AND scheduled_at IS NOT NULL", workspaceID, model.WorkoutStatusCompleted).
		Order("scheduled_at DESC").Limit(10000).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("workout history: %w", err)
	}

	byKey := make(map[string]*model.WorkoutHistoryBucket)
	for i := range rows {
		w := &rows[i]
		if w.ScheduledAt == nil {
			continue
		}
		var key string
		if bucket == "month" {
			key = w.ScheduledAt.Format("2006-01")
		} else {
			y, wk := w.ScheduledAt.ISOWeek()
			key = isoWeekKey(y, wk)
		}
		b, ok := byKey[key]
		if !ok {
			b = &model.WorkoutHistoryBucket{Bucket: key}
			byKey[key] = b
		}
		b.Count++
		if w.DurationMin != nil {
			b.Minutes += int64(*w.DurationMin)
		}
		if w.Calories != nil {
			b.Calories += *w.Calories
		}
	}

	keys := make([]string, 0, len(byKey))
	for k := range byKey {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) > limit {
		keys = keys[len(keys)-limit:]
	}
	out := make([]model.WorkoutHistoryBucket, 0, len(keys))
	for _, k := range keys {
		out = append(out, *byKey[k])
	}
	return out, nil
}

// -------------------------------------------------------------------
// WorkoutExercise (checklist of movements within a workout)
// -------------------------------------------------------------------

type WorkoutExerciseRepo struct {
	db *gorm.DB
}

func NewWorkoutExerciseRepo(db *gorm.DB) *WorkoutExerciseRepo {
	return &WorkoutExerciseRepo{db: db}
}

func (r *WorkoutExerciseRepo) ListExercises(ctx context.Context, workoutID uint) ([]model.WorkoutExercise, error) {
	var items []model.WorkoutExercise
	if err := r.db.WithContext(ctx).Where("workout_id = ?", workoutID).
		Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list exercises: %w", err)
	}
	return items, nil
}

// ListExercisesByWorkoutIDs is the bulk counterpart to ListExercises: it fetches
// movements for many workouts in one query (ordered so per-workout grouping
// stays stable), used by export to avoid an N+1 of one query per workout.
func (r *WorkoutExerciseRepo) ListExercisesByWorkoutIDs(ctx context.Context, workoutIDs []uint) ([]model.WorkoutExercise, error) {
	if len(workoutIDs) == 0 {
		return nil, nil
	}
	var items []model.WorkoutExercise
	if err := r.db.WithContext(ctx).Where("workout_id IN ?", workoutIDs).
		Order("workout_id ASC, sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list exercises by workout ids: %w", err)
	}
	return items, nil
}

func (r *WorkoutExerciseRepo) GetExercise(ctx context.Context, workoutID, exerciseID uint) (*model.WorkoutExercise, error) {
	var ex model.WorkoutExercise
	if err := r.db.WithContext(ctx).Where("id = ? AND workout_id = ?", exerciseID, workoutID).First(&ex).Error; err != nil {
		return nil, err
	}
	return &ex, nil
}

// CreateExercise appends an exercise and keeps the parent's denormalized counts
// consistent inside a single transaction.
func (r *WorkoutExerciseRepo) CreateExercise(ctx context.Context, ex *model.WorkoutExercise) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if ex.SortOrder == 0 {
			var maxOrder int
			tx.Model(&model.WorkoutExercise{}).Where("workout_id = ?", ex.WorkoutID).
				Select("COALESCE(MAX(sort_order),-1)").Scan(&maxOrder)
			ex.SortOrder = maxOrder + 1
		}
		if err := tx.Create(ex).Error; err != nil {
			return fmt.Errorf("create exercise: %w", err)
		}
		if err := tx.Model(&model.Workout{}).Where("id = ?", ex.WorkoutID).
			UpdateColumn("item_total", gorm.Expr("item_total + 1")).Error; err != nil {
			return fmt.Errorf("bump item_total: %w", err)
		}
		if ex.Done {
			if err := tx.Model(&model.Workout{}).Where("id = ?", ex.WorkoutID).
				UpdateColumn("item_done", gorm.Expr("item_done + 1")).Error; err != nil {
				return fmt.Errorf("bump item_done: %w", err)
			}
		}
		return nil
	})
}

// UpdateExercise writes the descriptive fields (done is toggled separately via
// SetExerciseDone so the parent progress counter never drifts).
func (r *WorkoutExerciseRepo) UpdateExercise(ctx context.Context, workoutID uint, ex *model.WorkoutExercise) error {
	if err := r.db.WithContext(ctx).Model(&model.WorkoutExercise{}).
		Where("id = ? AND workout_id = ?", ex.ID, workoutID).
		Updates(map[string]interface{}{
			"name":         ex.Name,
			"category":     ex.Category,
			"sets":         ex.Sets,
			"reps":         ex.Reps,
			"weight":       ex.Weight,
			"distance":     ex.Distance,
			"duration_sec": ex.DurationSec,
			"rest_sec":     ex.RestSec,
			"notes":        ex.Notes,
		}).Error; err != nil {
		return fmt.Errorf("update exercise: %w", err)
	}
	return nil
}

// SetExerciseDone flips the done flag and adjusts the parent's item_done counter
// inside one transaction.
func (r *WorkoutExerciseRepo) SetExerciseDone(ctx context.Context, workoutID, exerciseID uint, done bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var prev model.WorkoutExercise
		if err := tx.Where("id = ? AND workout_id = ?", exerciseID, workoutID).First(&prev).Error; err != nil {
			return err
		}
		if prev.Done == done {
			return nil
		}
		if err := tx.Model(&model.WorkoutExercise{}).Where("id = ?", exerciseID).
			UpdateColumn("done", done).Error; err != nil {
			return fmt.Errorf("set exercise done: %w", err)
		}
		delta := -1
		if done {
			delta = 1
		}
		if err := tx.Model(&model.Workout{}).Where("id = ?", workoutID).
			UpdateColumn("item_done", gorm.Expr("item_done + ?", delta)).Error; err != nil {
			return fmt.Errorf("adjust item_done: %w", err)
		}
		return nil
	})
}

// DeleteExercise removes an exercise and rebases the parent counts. When the
// removed exercise was done, item_done is decremented alongside item_total.
func (r *WorkoutExerciseRepo) DeleteExercise(ctx context.Context, workoutID, exerciseID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var prev model.WorkoutExercise
		if err := tx.Where("id = ? AND workout_id = ?", exerciseID, workoutID).First(&prev).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ? AND workout_id = ?", exerciseID, workoutID).
			Delete(&model.WorkoutExercise{}).Error; err != nil {
			return fmt.Errorf("delete exercise: %w", err)
		}
		if err := tx.Where("exercise_id = ?", exerciseID).Delete(&model.WorkoutSetLog{}).Error; err != nil {
			return fmt.Errorf("delete exercise set logs: %w", err)
		}
		if err := tx.Model(&model.Workout{}).Where("id = ?", workoutID).
			UpdateColumn("item_total", gorm.Expr("item_total - 1")).Error; err != nil {
			return fmt.Errorf("decrement item_total: %w", err)
		}
		if prev.Done {
			if err := tx.Model(&model.Workout{}).Where("id = ?", workoutID).
				UpdateColumn("item_done", gorm.Expr("item_done - 1")).Error; err != nil {
				return fmt.Errorf("decrement item_done: %w", err)
			}
		}
		return nil
	})
}

// ReorderExercise moves an exercise within its workout's manual order.
func (r *WorkoutExerciseRepo) ReorderExercise(ctx context.Context, workoutID, exerciseID uint, afterExerciseID *uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var all []model.WorkoutExercise
		if err := tx.Where("workout_id = ?", workoutID).
			Order("sort_order ASC, id ASC").Find(&all).Error; err != nil {
			return fmt.Errorf("load exercises for reorder: %w", err)
		}

		movedIdx := -1
		rest := make([]model.WorkoutExercise, 0, len(all))
		for i, t := range all {
			if t.ID == exerciseID {
				movedIdx = i
				continue
			}
			rest = append(rest, t)
		}
		if movedIdx == -1 {
			return nil
		}

		insertAt := 0
		if afterExerciseID != nil {
			for i, t := range rest {
				if t.ID == *afterExerciseID {
					insertAt = i + 1
					break
				}
			}
		}

		ordered := make([]model.WorkoutExercise, 0, len(rest)+1)
		ordered = append(ordered, rest[:insertAt]...)
		ordered = append(ordered, all[movedIdx])
		ordered = append(ordered, rest[insertAt:]...)

		ids := make([]uint, len(ordered))
		for i, t := range ordered {
			ids[i] = t.ID
		}
		if err := renumberSortOrder(tx, &model.WorkoutExercise{}, ids); err != nil {
			return fmt.Errorf("renumber exercise order: %w", err)
		}
		return nil
	})
}

// -------------------------------------------------------------------
// BodyMetric (time-series body / health records)
// -------------------------------------------------------------------

type BodyMetricRepo struct {
	db *gorm.DB
}

func NewBodyMetricRepo(db *gorm.DB) *BodyMetricRepo {
	return &BodyMetricRepo{db: db}
}

func (r *BodyMetricRepo) Create(ctx context.Context, m *model.BodyMetric) error {
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return fmt.Errorf("create body metric: %w", err)
	}
	return nil
}

func (r *BodyMetricRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.BodyMetric, error) {
	var m model.BodyMetric
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *BodyMetricRepo) List(ctx context.Context, workspaceID uint, q model.BodyMetricListQuery) ([]model.BodyMetric, int64, error) {
	q.Page, q.PageSize = clampPage(q.Page, q.PageSize)
	query := r.db.WithContext(ctx).Model(&model.BodyMetric{}).Where("workspace_id = ?", workspaceID)
	if q.DateAfter != nil {
		query = query.Where("recorded_at >= ?", *q.DateAfter)
	}
	if q.DateBefore != nil {
		query = query.Where("recorded_at <= ?", *q.DateBefore)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count body metrics: %w", err)
	}

	var metrics []model.BodyMetric
	offset := (q.Page - 1) * q.PageSize
	if err := query.Order("recorded_at DESC, id DESC").
		Limit(q.PageSize).Offset(offset).Find(&metrics).Error; err != nil {
		return nil, 0, fmt.Errorf("list body metrics: %w", err)
	}
	return metrics, total, nil
}

func (r *BodyMetricRepo) Update(ctx context.Context, m *model.BodyMetric) error {
	if err := r.db.WithContext(ctx).Model(&model.BodyMetric{ID: m.ID}).
		Select("recorded_at", "weight", "height", "body_fat", "muscle_mass", "resting_hr", "systolic", "diastolic", "sleep_hours", "steps", "energy", "mood", "notes").
		Updates(m).Error; err != nil {
		return fmt.Errorf("update body metric: %w", err)
	}
	return nil
}

func (r *BodyMetricRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	res := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.BodyMetric{})
	if res.Error != nil {
		return fmt.Errorf("delete body metric: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Summary derives an overview from the recorded history: latest snapshot, the
// previous weight (for trend direction), total count and time span.
func (r *BodyMetricRepo) Summary(ctx context.Context, workspaceID uint) (model.BodyMetricSummary, error) {
	var sum model.BodyMetricSummary

	if err := r.db.WithContext(ctx).Model(&model.BodyMetric{}).
		Where("workspace_id = ?", workspaceID).Count(&sum.Count).Error; err != nil {
		return sum, fmt.Errorf("count body metrics: %w", err)
	}
	if sum.Count == 0 {
		sum.WeightTrend = "none"
		return sum, nil
	}

	var latest model.BodyMetric
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("recorded_at DESC, id DESC").First(&latest).Error; err != nil {
		return sum, fmt.Errorf("load latest body metric: %w", err)
	}
	sum.Latest = &latest
	sum.LastAt = &latest.RecordedAt
	if latest.Weight != nil {
		w := *latest.Weight
		sum.LatestWeight = &w
	}

	// Previous record (by recorded_at) for trend direction.
	var prev model.BodyMetric
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND id <> ?", workspaceID, latest.ID).
		Order("recorded_at DESC, id DESC").First(&prev).Error; err == nil {
		if prev.Weight != nil {
			w := *prev.Weight
			sum.PrevWeight = &w
		}
	}

	var first model.BodyMetric
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("recorded_at ASC, id ASC").First(&first).Error; err == nil {
		t := first.RecordedAt
		sum.FirstAt = &t
	}

	sum.WeightTrend = bodyWeightTrend(sum.LatestWeight, sum.PrevWeight)
	sum.Metrics = bodyMetricTrends(r.db.WithContext(ctx), workspaceID)
	return sum, nil
}

// trendFlatDeltas maps each body metric to the delta below which the trend is
// reported flat, so noise (a 0.05kg body-fat wiggle) doesn't flip the arrow.
var trendFlatDeltas = map[string]float64{
	"weight": 0.1, "body_fat": 0.1, "muscle_mass": 0.1, "sleep_hours": 0.1,
	"resting_hr": 1, "systolic": 1, "diastolic": 1, "steps": 50, "energy": 0, "mood": 0,
}

// bodyMetricTrends walks the most recent records (newest first) and, per
// metric, captures the latest and previous non-null values, then classifies
// the direction. One extra query total.
func bodyMetricTrends(db *gorm.DB, workspaceID uint) map[string]model.MetricTrend {
	var rows []model.BodyMetric
	if err := db.Where("workspace_id = ?", workspaceID).
		Order("recorded_at DESC, id DESC").Limit(200).Find(&rows).Error; err != nil {
		return nil
	}

	getters := map[string]func(m *model.BodyMetric) *float64{
		"body_fat":    func(m *model.BodyMetric) *float64 { return m.BodyFat },
		"muscle_mass": func(m *model.BodyMetric) *float64 { return m.MuscleMass },
		"resting_hr":  func(m *model.BodyMetric) *float64 { return floatOf(m.RestingHR) },
		"systolic":    func(m *model.BodyMetric) *float64 { return floatOf(m.Systolic) },
		"diastolic":   func(m *model.BodyMetric) *float64 { return floatOf(m.Diastolic) },
		"sleep_hours": func(m *model.BodyMetric) *float64 { return m.SleepHours },
		"steps":       func(m *model.BodyMetric) *float64 { return floatOf(m.Steps) },
		"energy":      func(m *model.BodyMetric) *float64 { return floatOf(m.Energy) },
		"mood":        func(m *model.BodyMetric) *float64 { return floatOf(m.Mood) },
	}

	trends := make(map[string]model.MetricTrend, len(getters))
	for key, get := range getters {
		var latest, prev *float64
		for i := range rows {
			v := get(&rows[i])
			if v == nil {
				continue
			}
			if latest == nil {
				val := *v
				latest = &val
				continue
			}
			val := *v
			prev = &val
			break
		}
		trends[key] = model.MetricTrend{Latest: latest, Prev: prev, Trend: trendFor(latest, prev, trendFlatDeltas[key])}
	}
	return trends
}

// floatOf widens an optional int so int-typed metrics share the trend helpers.
func floatOf(p *int) *float64 {
	if p == nil {
		return nil
	}
	v := float64(*p)
	return &v
}

func trendFor(latest, prev *float64, flatDelta float64) string {
	if latest == nil || prev == nil {
		return "none"
	}
	d := *latest - *prev
	switch {
	case d > flatDelta:
		return "up"
	case d < -flatDelta:
		return "down"
	default:
		return "flat"
	}
}

// bodyWeightTrend classifies the latest-vs-previous weight delta. A change under
// 0.1kg is treated as flat so noise doesn't flip the arrow.
func bodyWeightTrend(latest, prev *float64) string {
	if latest == nil || prev == nil {
		return "none"
	}
	d := *latest - *prev
	switch {
	case d > 0.1:
		return "up"
	case d < -0.1:
		return "down"
	default:
		return "flat"
	}
}
