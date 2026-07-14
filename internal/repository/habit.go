package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type HabitRepo struct {
	db *gorm.DB
}

func NewHabitRepo(db *gorm.DB) *HabitRepo {
	return &HabitRepo{db: db}
}

func (r *HabitRepo) Create(ctx context.Context, h *model.Habit) error {
	if err := r.db.WithContext(ctx).Create(h).Error; err != nil {
		return fmt.Errorf("create habit: %w", err)
	}
	return nil
}

func (r *HabitRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Habit, error) {
	var h model.Habit
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&h).Error; err != nil {
		return nil, err
	}
	return &h, nil
}

func (r *HabitRepo) List(ctx context.Context, workspaceID uint, includeArchived bool) ([]model.Habit, error) {
	var habits []model.Habit
	q := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if !includeArchived {
		q = q.Where("archived = ?", false)
	}
	if err := q.Order("archived ASC, sort_order ASC, id ASC").Find(&habits).Error; err != nil {
		return nil, fmt.Errorf("list habits: %w", err)
	}
	return habits, nil
}

func (r *HabitRepo) Update(ctx context.Context, h *model.Habit) error {
	if err := r.db.WithContext(ctx).Model(&model.Habit{ID: h.ID}).
		Select("name", "color", "emoji", "frequency", "archived", "sort_order").
		Updates(h).Error; err != nil {
		return fmt.Errorf("update habit: %w", err)
	}
	return nil
}

func (r *HabitRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Habit{}).Error; err != nil {
		return fmt.Errorf("delete habit: %w", err)
	}
	return nil
}
