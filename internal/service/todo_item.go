package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTodoItemNotFound = errors.New("todo item not found")

type TodoItemService struct {
	repo    TodoItemRepository
	todoRepo TodoRepository
}

func NewTodoItemService(repo TodoItemRepository, todoRepo TodoRepository) *TodoItemService {
	return &TodoItemService{repo: repo, todoRepo: todoRepo}
}

// Create adds a sub-task under a todo. The parent todo must exist in the
// workspace.
func (s *TodoItemService) Create(ctx context.Context, userID, workspaceID, todoID uint, item *model.TodoItem) (*model.TodoItem, error) {
	if _, err := s.todoRepo.GetByID(ctx, workspaceID, todoID); err != nil {
		return nil, ErrTodoNotFound
	}
	item.UserID = userID
	item.WorkspaceID = workspaceID
	item.TodoID = todoID
	item.ID = 0
	if err := s.repo.Create(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *TodoItemService) ListByTodo(ctx context.Context, userID, workspaceID, todoID uint) ([]model.TodoItem, error) {
	if _, err := s.todoRepo.GetByID(ctx, workspaceID, todoID); err != nil {
		return nil, ErrTodoNotFound
	}
	return s.repo.ListByTodo(ctx, workspaceID, todoID)
}

func (s *TodoItemService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.TodoItem) (*model.TodoItem, error) {
	item, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoItemNotFound
	}
	if updates.Title != "" {
		item.Title = updates.Title
	}
	item.Done = updates.Done
	if updates.SortOrder != 0 || item.SortOrder == 0 {
		item.SortOrder = updates.SortOrder
	}
	if err := s.repo.Update(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

// Toggle flips a sub-task's done state.
func (s *TodoItemService) Toggle(ctx context.Context, userID, workspaceID, id uint) (*model.TodoItem, error) {
	item, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoItemNotFound
	}
	item.Done = !item.Done
	if err := s.repo.Update(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *TodoItemService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}
