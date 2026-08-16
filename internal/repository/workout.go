package repository

import (
	"context"
	"fmt"
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

// Delete soft-deletes a workout along with its exercises.
func (r *WorkoutRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("workout_id = ?", id).Delete(&model.WorkoutExercise{}).Error; err != nil {
			return fmt.Errorf("delete workout exercises: %w", err)
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
	return stats, nil
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

func (r *BodyMetricRepo) List(ctx context.Context, workspaceID uint, page, pageSize int) ([]model.BodyMetric, int64, error) {
	page, pageSize = clampPage(page, pageSize)
	query := r.db.WithContext(ctx).Model(&model.BodyMetric{}).Where("workspace_id = ?", workspaceID)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count body metrics: %w", err)
	}

	var metrics []model.BodyMetric
	offset := (page - 1) * pageSize
	if err := query.Order("recorded_at DESC, id DESC").
		Limit(pageSize).Offset(offset).Find(&metrics).Error; err != nil {
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
	return sum, nil
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
