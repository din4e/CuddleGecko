package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TodoListRepo struct {
	db *gorm.DB
}

func NewTodoListRepo(db *gorm.DB) *TodoListRepo {
	return &TodoListRepo{db: db}
}

func (r *TodoListRepo) Create(ctx context.Context, list *model.TodoList) error {
	if err := r.db.WithContext(ctx).Create(list).Error; err != nil {
		return fmt.Errorf("create todo list: %w", err)
	}
	return nil
}

func (r *TodoListRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.TodoList, error) {
	var list model.TodoList
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&list).Error; err != nil {
		return nil, err
	}
	return &list, nil
}

func (r *TodoListRepo) List(ctx context.Context, workspaceID uint) ([]model.TodoList, error) {
	var lists []model.TodoList
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("sort_order ASC, id ASC").Find(&lists).Error; err != nil {
		return nil, fmt.Errorf("list todo lists: %w", err)
	}
	return lists, nil
}

func (r *TodoListRepo) Update(ctx context.Context, list *model.TodoList) error {
	if err := r.db.WithContext(ctx).Model(&model.TodoList{ID: list.ID}).
		Select("name", "color", "sort_order").
		Updates(list).Error; err != nil {
		return fmt.Errorf("update todo list: %w", err)
	}
	return nil
}

// Delete removes the list and reassigns its todos back to the Inbox (list_id NULL).
func (r *TodoListRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Todo{}).
			Where("list_id = ? AND workspace_id = ?", id, workspaceID).
			Update("list_id", nil).Error; err != nil {
			return fmt.Errorf("reassign todos: %w", err)
		}
		if err := tx.Where("id = ? AND workspace_id = ?", id, workspaceID).
			Delete(&model.TodoList{}).Error; err != nil {
			return fmt.Errorf("delete todo list: %w", err)
		}
		return nil
	})
}
