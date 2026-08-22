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
// ExerciseLibrary (reusable movement definitions)
// -------------------------------------------------------------------

type ExerciseLibraryRepo struct {
	db *gorm.DB
}

func NewExerciseLibraryRepo(db *gorm.DB) *ExerciseLibraryRepo {
	return &ExerciseLibraryRepo{db: db}
}

func (r *ExerciseLibraryRepo) List(ctx context.Context, workspaceID uint, search string) ([]model.ExerciseLibraryItem, error) {
	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if search != "" {
		query = query.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(search)+"%")
	}
	var items []model.ExerciseLibraryItem
	if err := query.Order("name ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list exercise library: %w", err)
	}
	return items, nil
}

func (r *ExerciseLibraryRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.ExerciseLibraryItem, error) {
	var item model.ExerciseLibraryItem
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// NameExists checks for a duplicate (non-deleted) name in the workspace.
func (r *ExerciseLibraryRepo) NameExists(ctx context.Context, workspaceID uint, name string, excludeID uint) (bool, error) {
	var count int64
	query := r.db.WithContext(ctx).Model(&model.ExerciseLibraryItem{}).
		Where("workspace_id = ? AND LOWER(name) = ?", workspaceID, strings.ToLower(name))
	if excludeID != 0 {
		query = query.Where("id <> ?", excludeID)
	}
	if err := query.Count(&count).Error; err != nil {
		return false, fmt.Errorf("check exercise name: %w", err)
	}
	return count > 0, nil
}

func (r *ExerciseLibraryRepo) Create(ctx context.Context, item *model.ExerciseLibraryItem) error {
	if err := r.db.WithContext(ctx).Create(item).Error; err != nil {
		return fmt.Errorf("create exercise library item: %w", err)
	}
	return nil
}

func (r *ExerciseLibraryRepo) Update(ctx context.Context, item *model.ExerciseLibraryItem) error {
	if err := r.db.WithContext(ctx).Model(&model.ExerciseLibraryItem{}).
		Where("id = ?", item.ID).
		Updates(map[string]interface{}{
			"name":          item.Name,
			"category":      item.Category,
			"muscle_groups": item.MuscleGroups,
			"equipment":     item.Equipment,
			"notes":         item.Notes,
		}).Error; err != nil {
		return fmt.Errorf("update exercise library item: %w", err)
	}
	return nil
}

func (r *ExerciseLibraryRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	res := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.ExerciseLibraryItem{})
	if res.Error != nil {
		return fmt.Errorf("delete exercise library item: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// -------------------------------------------------------------------
// WorkoutTemplate (reusable routines)
// -------------------------------------------------------------------

type WorkoutTemplateRepo struct {
	db *gorm.DB
}

func NewWorkoutTemplateRepo(db *gorm.DB) *WorkoutTemplateRepo {
	return &WorkoutTemplateRepo{db: db}
}

// List returns templates with their items (bulk fetch, no N+1).
func (r *WorkoutTemplateRepo) List(ctx context.Context, workspaceID uint) ([]model.WorkoutTemplate, error) {
	var templates []model.WorkoutTemplate
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("name ASC").Find(&templates).Error; err != nil {
		return nil, fmt.Errorf("list workout templates: %w", err)
	}
	if len(templates) == 0 {
		return templates, nil
	}
	ids := make([]uint, len(templates))
	for i := range templates {
		ids[i] = templates[i].ID
	}
	var items []model.WorkoutTemplateItem
	if err := r.db.WithContext(ctx).Where("template_id IN ?", ids).
		Order("template_id ASC, sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list workout template items: %w", err)
	}
	for i := range templates {
		t := &templates[i]
		t.Items = nil
		for j := range items {
			if items[j].TemplateID == t.ID {
				t.Items = append(t.Items, items[j])
			}
		}
	}
	return templates, nil
}

func (r *WorkoutTemplateRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.WorkoutTemplate, error) {
	var t model.WorkoutTemplate
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&t).Error; err != nil {
		return nil, err
	}
	var items []model.WorkoutTemplateItem
	if err := r.db.WithContext(ctx).Where("template_id = ?", t.ID).
		Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("load template items: %w", err)
	}
	t.Items = items
	return &t, nil
}

// Create saves the template and its items in one transaction.
func (r *WorkoutTemplateRepo) Create(ctx context.Context, t *model.WorkoutTemplate) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		t.Items = normalizeTemplateItems(t.Items)
		if err := tx.Create(t).Error; err != nil {
			return fmt.Errorf("create template: %w", err)
		}
		for i := range t.Items {
			t.Items[i].ID = 0
			t.Items[i].TemplateID = t.ID
			if err := tx.Create(&t.Items[i]).Error; err != nil {
				return fmt.Errorf("create template item: %w", err)
			}
		}
		return nil
	})
}

// Update replaces the template's descriptive fields and its whole item list.
func (r *WorkoutTemplateRepo) Update(ctx context.Context, t *model.WorkoutTemplate) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.WorkoutTemplate{}).Where("id = ?", t.ID).Updates(map[string]interface{}{
			"name":  t.Name,
			"type":  t.Type,
			"notes": t.Notes,
		}).Error; err != nil {
			return fmt.Errorf("update template: %w", err)
		}
		if t.Items != nil {
			if err := tx.Where("template_id = ?", t.ID).Delete(&model.WorkoutTemplateItem{}).Error; err != nil {
				return fmt.Errorf("clear template items: %w", err)
			}
			items := normalizeTemplateItems(t.Items)
			for i := range items {
				items[i].ID = 0
				items[i].TemplateID = t.ID
				if err := tx.Create(&items[i]).Error; err != nil {
					return fmt.Errorf("create template item: %w", err)
				}
			}
			t.Items = items
		}
		return nil
	})
}

func (r *WorkoutTemplateRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("template_id = ?", id).Delete(&model.WorkoutTemplateItem{}).Error; err != nil {
			return fmt.Errorf("delete template items: %w", err)
		}
		res := tx.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.WorkoutTemplate{})
		if res.Error != nil {
			return fmt.Errorf("delete template: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

// normalizeTemplateItems drops blank-named entries and renumbers the order.
func normalizeTemplateItems(items []model.WorkoutTemplateItem) []model.WorkoutTemplateItem {
	out := make([]model.WorkoutTemplateItem, 0, len(items))
	for _, it := range items {
		name := strings.TrimSpace(it.Name)
		if name == "" {
			continue
		}
		it.Name = name
		out = append(out, it)
	}
	for i := range out {
		out[i].SortOrder = i + 1
	}
	return out
}

// -------------------------------------------------------------------
// WorkoutSetLog (per-set training logs)
// -------------------------------------------------------------------

type WorkoutSetLogRepo struct {
	db *gorm.DB
}

func NewWorkoutSetLogRepo(db *gorm.DB) *WorkoutSetLogRepo {
	return &WorkoutSetLogRepo{db: db}
}

func (r *WorkoutSetLogRepo) ListByExercise(ctx context.Context, workoutID, exerciseID uint) ([]model.WorkoutSetLog, error) {
	var logs []model.WorkoutSetLog
	if err := r.db.WithContext(ctx).Where("workout_id = ? AND exercise_id = ?", workoutID, exerciseID).
		Order("set_index ASC, id ASC").Find(&logs).Error; err != nil {
		return nil, fmt.Errorf("list set logs: %w", err)
	}
	return logs, nil
}

func (r *WorkoutSetLogRepo) GetByID(ctx context.Context, workoutID, exerciseID, id uint) (*model.WorkoutSetLog, error) {
	var log model.WorkoutSetLog
	if err := r.db.WithContext(ctx).
		Where("id = ? AND workout_id = ? AND exercise_id = ?", id, workoutID, exerciseID).
		First(&log).Error; err != nil {
		return nil, err
	}
	return &log, nil
}

func (r *WorkoutSetLogRepo) Create(ctx context.Context, log *model.WorkoutSetLog) error {
	if log.SetIndex == 0 {
		var maxIdx int
		r.db.WithContext(ctx).Model(&model.WorkoutSetLog{}).
			Where("workout_id = ? AND exercise_id = ?", log.WorkoutID, log.ExerciseID).
			Select("COALESCE(MAX(set_index),0)").Scan(&maxIdx)
		log.SetIndex = maxIdx + 1
	}
	if err := r.db.WithContext(ctx).Create(log).Error; err != nil {
		return fmt.Errorf("create set log: %w", err)
	}
	return nil
}

func (r *WorkoutSetLogRepo) Update(ctx context.Context, log *model.WorkoutSetLog) error {
	if err := r.db.WithContext(ctx).Model(&model.WorkoutSetLog{}).Where("id = ?", log.ID).
		Updates(map[string]interface{}{
			"reps":          log.Reps,
			"weight":        log.Weight,
			"distance":      log.Distance,
			"duration_sec":  log.DurationSec,
			"done":          log.Done,
			"notes":         log.Notes,
		}).Error; err != nil {
		return fmt.Errorf("update set log: %w", err)
	}
	return nil
}

func (r *WorkoutSetLogRepo) Delete(ctx context.Context, workoutID, exerciseID, id uint) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND workout_id = ? AND exercise_id = ?", id, workoutID, exerciseID).
		Delete(&model.WorkoutSetLog{})
	if res.Error != nil {
		return fmt.Errorf("delete set log: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// PRs derives per-exercise personal records (best weight and best Epley
// estimated 1RM) from set logs. One joined query; the max-math is in Go so no
// dialect-specific SQL is needed.
func (r *WorkoutSetLogRepo) PRs(ctx context.Context, workspaceID uint) ([]model.ExercisePR, error) {
	var rows []struct {
		Exercise string     `gorm:"column:exercise"`
		Weight   *float64   `gorm:"column:weight"`
		Reps     *int       `gorm:"column:reps"`
		LoggedAt time.Time  `gorm:"column:logged_at"`
	}
	if err := r.db.WithContext(ctx).Table("workout_set_logs l").
		Select("e.name AS exercise, l.weight AS weight, l.reps AS reps, l.created_at AS logged_at").
		Joins("JOIN workout_exercises e ON e.id = l.exercise_id").
		Joins("JOIN workouts w ON w.id = l.workout_id AND w.workspace_id = ?", workspaceID).
		Where("l.weight IS NOT NULL AND l.weight > 0 AND l.deleted_at IS NULL").
		Order("l.created_at DESC").
		Limit(20000).
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("workout prs: %w", err)
	}

	type agg struct {
		bestWeight float64
		bestE1RM   float64
		bestAt     time.Time
	}
	byName := map[string]*agg{}
	for _, row := range rows {
		w := *row.Weight
		e1rm := w * (1 + float64(derefInt(row.Reps))/30)
		a, ok := byName[row.Exercise]
		if !ok {
			a = &agg{bestWeight: w, bestE1RM: e1rm, bestAt: row.LoggedAt}
			byName[row.Exercise] = a
			continue
		}
		if w > a.bestWeight {
			a.bestWeight = w
		}
		if e1rm > a.bestE1RM {
			a.bestE1RM = e1rm
			a.bestAt = row.LoggedAt
		}
	}

	names := make([]string, 0, len(byName))
	for n := range byName {
		names = append(names, n)
	}
	sort.Strings(names)
	prs := make([]model.ExercisePR, 0, len(names))
	for _, n := range names {
		a := byName[n]
		at := a.bestAt
		prs = append(prs, model.ExercisePR{
			Exercise:   n,
			BestWeight: a.bestWeight,
			BestE1RM:   a.bestE1RM,
			BestSetAt:  &at,
		})
	}
	return prs, nil
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// -------------------------------------------------------------------
// FitnessGoal
// -------------------------------------------------------------------

type FitnessGoalRepo struct {
	db *gorm.DB
}

func NewFitnessGoalRepo(db *gorm.DB) *FitnessGoalRepo {
	return &FitnessGoalRepo{db: db}
}

func (r *FitnessGoalRepo) List(ctx context.Context, workspaceID uint) ([]model.FitnessGoal, error) {
	var goals []model.FitnessGoal
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").Find(&goals).Error; err != nil {
		return nil, fmt.Errorf("list fitness goals: %w", err)
	}
	return goals, nil
}

func (r *FitnessGoalRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.FitnessGoal, error) {
	var g model.FitnessGoal
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&g).Error; err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *FitnessGoalRepo) Create(ctx context.Context, g *model.FitnessGoal) error {
	if err := r.db.WithContext(ctx).Create(g).Error; err != nil {
		return fmt.Errorf("create fitness goal: %w", err)
	}
	return nil
}

func (r *FitnessGoalRepo) Update(ctx context.Context, g *model.FitnessGoal) error {
	if err := r.db.WithContext(ctx).Model(&model.FitnessGoal{}).Where("id = ?", g.ID).
		Updates(map[string]interface{}{
			"type":          g.Type,
			"target_value":  g.TargetValue,
			"deadline":      g.Deadline,
			"status":        g.Status,
			"notes":         g.Notes,
		}).Error; err != nil {
		return fmt.Errorf("update fitness goal: %w", err)
	}
	return nil
}

func (r *FitnessGoalRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	res := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.FitnessGoal{})
	if res.Error != nil {
		return fmt.Errorf("delete fitness goal: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
