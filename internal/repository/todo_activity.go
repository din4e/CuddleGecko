package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// TodoActivityRepo persists the per-todo audit log (who changed what, when).
type TodoActivityRepo struct {
	db *gorm.DB
}

func NewTodoActivityRepo(db *gorm.DB) *TodoActivityRepo {
	return &TodoActivityRepo{db: db}
}

// CreateBatch appends activity lines in one INSERT. Callers are expected to
// have already verified the todo belongs to the workspace.
func (r *TodoActivityRepo) CreateBatch(ctx context.Context, activities []model.TodoActivity) error {
	if len(activities) == 0 {
		return nil
	}
	if err := r.db.WithContext(ctx).Create(&activities).Error; err != nil {
		return fmt.Errorf("create todo activities: %w", err)
	}
	return nil
}

// List returns a todo's activity lines, newest first.
func (r *TodoActivityRepo) List(ctx context.Context, todoID uint, limit int) ([]model.TodoActivity, error) {
	if limit <= 0 || limit > maxPageSize {
		limit = maxPageSize
	}
	var activities []model.TodoActivity
	if err := r.db.WithContext(ctx).
		Where("todo_id = ?", todoID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&activities).Error; err != nil {
		return nil, fmt.Errorf("list todo activities: %w", err)
	}
	return activities, nil
}

