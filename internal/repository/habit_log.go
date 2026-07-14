package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type HabitLogRepo struct {
	db *gorm.DB
}

func NewHabitLogRepo(db *gorm.DB) *HabitLogRepo {
	return &HabitLogRepo{db: db}
}

// Toggle checks in for a date if absent (returns true), or removes the
// check-in if present (returns false). Idempotent and transactional.
func (r *HabitLogRepo) Toggle(ctx context.Context, userID, workspaceID, habitID uint, date string) (bool, error) {
	var checked bool
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing model.HabitLog
		err := tx.Where("workspace_id = ? AND habit_id = ? AND date = ?", workspaceID, habitID, date).First(&existing).Error
		if err == nil {
			// exists -> uncheck
			if err := tx.Delete(&existing).Error; err != nil {
				return fmt.Errorf("uncheck habit: %w", err)
			}
			checked = false
			return nil
		}
		if err != gorm.ErrRecordNotFound {
			return fmt.Errorf("query habit log: %w", err)
		}
		log := &model.HabitLog{
			UserID:      userID,
			WorkspaceID: workspaceID,
			HabitID:     habitID,
			Date:        date,
		}
		if err := tx.Create(log).Error; err != nil {
			return fmt.Errorf("check in habit: %w", err)
		}
		checked = true
		return nil
	})
	return checked, err
}

// ListAllByWorkspace returns every check-in log in the workspace (for stats).
func (r *HabitLogRepo) ListAllByWorkspace(ctx context.Context, workspaceID uint) ([]model.HabitLog, error) {
	var logs []model.HabitLog
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("date ASC").
		Find(&logs).Error; err != nil {
		return nil, fmt.Errorf("list habit logs: %w", err)
	}
	return logs, nil
}

func (r *HabitLogRepo) DeleteByHabit(ctx context.Context, workspaceID, habitID uint) error {
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND habit_id = ?", workspaceID, habitID).
		Delete(&model.HabitLog{}).Error; err != nil {
		return fmt.Errorf("delete habit logs: %w", err)
	}
	return nil
}
