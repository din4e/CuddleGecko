package repository

import (
	"context"
	"fmt"
	"time"

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

// List supports filtering by status, list (0 = Inbox), overdue, and an explicit
// ID allow-list (used to apply a tag filter resolved by the tagging repo).
func (r *TodoRepo) List(ctx context.Context, workspaceID uint, status *string, listID *uint, overdue bool, idFilter []uint, page, pageSize int) ([]model.Todo, int64, error) {
	var todos []model.Todo
	query := r.db.WithContext(ctx).Model(&model.Todo{}).Where("workspace_id = ?", workspaceID)
	if status != nil && *status != "" {
		query = query.Where("status = ?", *status)
	}
	if listID != nil {
		if *listID == 0 {
			query = query.Where("list_id IS NULL")
		} else {
			query = query.Where("list_id = ?", *listID)
		}
	}
	if overdue {
		query = query.Where("status = ? AND due_time IS NOT NULL AND due_time < ?", "pending", time.Now())
	}
	if len(idFilter) > 0 {
		query = query.Where("id IN ?", idFilter)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count todos: %w", err)
	}

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	if err := query.Order("due_time IS NULL, due_time ASC, created_at DESC").
		Limit(pageSize).Offset(offset).
		Find(&todos).Error; err != nil {
		return nil, 0, fmt.Errorf("list todos: %w", err)
	}
	return todos, total, nil
}

func (r *TodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	if err := r.db.WithContext(ctx).Model(&model.Todo{ID: todo.ID}).
		Select("title", "description", "status", "priority", "due_time", "amount", "amount_type", "contact_ids", "color", "list_id", "repeat_rule", "repeat_every", "repeat_until", "notified", "completed_at").
		Updates(todo).Error; err != nil {
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
