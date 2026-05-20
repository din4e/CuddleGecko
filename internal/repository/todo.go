package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TodoRepo struct {
	db *gorm.DB
}

func NewTodoRepo(db *gorm.DB) *TodoRepo {
	return &TodoRepo{db: db}
}

func (r *TodoRepo) Create(ctx context.Context, todo *model.Todo) error {
	if err := r.db.WithContext(ctx).Create(todo).Error; err != nil {
		return fmt.Errorf("create todo: %w", err)
	}
	return nil
}

func (r *TodoRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error) {
	var todo model.Todo
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&todo).Error; err != nil {
		return nil, err
	}
	return &todo, nil
}

func (r *TodoRepo) List(ctx context.Context, workspaceID uint, status *string) ([]model.Todo, error) {
	var todos []model.Todo
	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if status != nil && *status != "" {
		query = query.Where("status = ?", *status)
	}
	if err := query.Order("due_time ASC NULLS LAST, created_at DESC").Find(&todos).Error; err != nil {
		return nil, fmt.Errorf("list todos: %w", err)
	}
	return todos, nil
}

func (r *TodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	if err := r.db.WithContext(ctx).Save(todo).Error; err != nil {
		return fmt.Errorf("update todo: %w", err)
	}
	return nil
}

func (r *TodoRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Todo{}).Error; err != nil {
		return fmt.Errorf("delete todo: %w", err)
	}
	return nil
}
