package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTodoListNotFound = errors.New("todo list not found")

type TodoListRepository interface {
	Create(ctx context.Context, list *model.TodoList) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.TodoList, error)
	List(ctx context.Context, workspaceID uint) ([]model.TodoList, error)
	Update(ctx context.Context, list *model.TodoList) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type TodoListService struct {
	repo TodoListRepository
}

func NewTodoListService(repo TodoListRepository) *TodoListService {
	return &TodoListService{repo: repo}
}

func (s *TodoListService) Create(ctx context.Context, userID, workspaceID uint, list *model.TodoList) (*model.TodoList, error) {
	list.UserID = userID
	list.WorkspaceID = workspaceID
	list.ID = 0
	if err := s.repo.Create(ctx, list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *TodoListService) List(ctx context.Context, userID, workspaceID uint) ([]model.TodoList, error) {
	return s.repo.List(ctx, workspaceID)
}

func (s *TodoListService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.TodoList) (*model.TodoList, error) {
	list, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoListNotFound
	}
	if updates.Name != "" {
		list.Name = updates.Name
	}
	list.Color = updates.Color
	if updates.SortOrder != 0 || list.SortOrder == 0 {
		list.SortOrder = updates.SortOrder
	}
	if err := s.repo.Update(ctx, list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *TodoListService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}
