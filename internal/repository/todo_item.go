package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TodoItemRepo struct {
	db *gorm.DB
}

func NewTodoItemRepo(db *gorm.DB) *TodoItemRepo {
	return &TodoItemRepo{db: db}
}

func (r *TodoItemRepo) Create(ctx context.Context, item *model.TodoItem) error {
	if err := r.db.WithContext(ctx).Create(item).Error; err != nil {
		return fmt.Errorf("create todo item: %w", err)
	}
	return nil
}

func (r *TodoItemRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.TodoItem, error) {
	var item model.TodoItem
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *TodoItemRepo) ListByTodo(ctx context.Context, workspaceID, todoID uint) ([]model.TodoItem, error) {
	var items []model.TodoItem
	if err := r.db.WithContext(ctx).Where("todo_id = ? AND workspace_id = ?", todoID, workspaceID).
		Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list todo items: %w", err)
	}
	return items, nil
}

// ListByTodos batch-loads sub-tasks for many todos (todoID -> items).
func (r *TodoItemRepo) ListByTodos(ctx context.Context, workspaceID uint, todoIDs []uint) (map[uint][]model.TodoItem, error) {
	result := make(map[uint][]model.TodoItem, len(todoIDs))
	if len(todoIDs) == 0 {
		return result, nil
	}
	var items []model.TodoItem
	if err := r.db.WithContext(ctx).Where("workspace_id = ? AND todo_id IN ?", workspaceID, todoIDs).
		Order("todo_id ASC, sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list todo items by todos: %w", err)
	}
	for i := range items {
		it := items[i]
		result[it.TodoID] = append(result[it.TodoID], it)
	}
	return result, nil
}

func (r *TodoItemRepo) Update(ctx context.Context, item *model.TodoItem) error {
	if err := r.db.WithContext(ctx).Model(&model.TodoItem{ID: item.ID}).
		Select("title", "done", "sort_order").
		Updates(item).Error; err != nil {
		return fmt.Errorf("update todo item: %w", err)
	}
	return nil
}

func (r *TodoItemRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.TodoItem{}).Error; err != nil {
		return fmt.Errorf("delete todo item: %w", err)
	}
	return nil
}

func (r *TodoItemRepo) DeleteByTodo(ctx context.Context, workspaceID, todoID uint) error {
	if err := r.db.WithContext(ctx).Where("todo_id = ? AND workspace_id = ?", todoID, workspaceID).Delete(&model.TodoItem{}).Error; err != nil {
		return fmt.Errorf("delete todo items by todo: %w", err)
	}
	return nil
}
