package service

import (
	"context"
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTodoNotFound = errors.New("todo not found")

type TodoRepository interface {
	Create(ctx context.Context, todo *model.Todo) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error)
	List(ctx context.Context, workspaceID uint, status *string) ([]model.Todo, error)
	Update(ctx context.Context, todo *model.Todo) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type EventRepositoryForSync interface {
	Create(ctx context.Context, event *model.Event) error
}

type TodoService struct {
	repo     TodoRepository
	eventRepo EventRepositoryForSync
}

func NewTodoService(repo TodoRepository, eventRepo EventRepositoryForSync) *TodoService {
	return &TodoService{repo: repo, eventRepo: eventRepo}
}

func (s *TodoService) Create(ctx context.Context, userID, workspaceID uint, todo *model.Todo) (*model.Todo, error) {
	todo.UserID = userID
	todo.WorkspaceID = workspaceID
	if todo.Status == "" {
		todo.Status = "pending"
	}
	if todo.Priority == "" {
		todo.Priority = "normal"
	}
	if err := s.repo.Create(ctx, todo); err != nil {
		return nil, err
	}
	return todo, nil
}

func (s *TodoService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	return s.repo.GetByID(ctx, workspaceID, id)
}

func (s *TodoService) List(ctx context.Context, userID, workspaceID uint, status *string) ([]model.Todo, error) {
	return s.repo.List(ctx, workspaceID, status)
}

func (s *TodoService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Todo) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}

	if updates.Title != "" {
		todo.Title = updates.Title
	}
	todo.Description = updates.Description
	if updates.Status != "" {
		todo.Status = updates.Status
	}
	if updates.Priority != "" {
		todo.Priority = updates.Priority
	}
	if updates.DueTime != nil {
		todo.DueTime = updates.DueTime
	}
	if updates.Amount != nil {
		todo.Amount = updates.Amount
	}
	todo.AmountType = updates.AmountType
	todo.ContactIDs = updates.ContactIDs
	todo.Color = updates.Color

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	return todo, nil
}

func (s *TodoService) ToggleStatus(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}

	if todo.Status == "pending" {
		todo.Status = "done"
		now := time.Now()
		todo.CompletedAt = &now
	} else {
		todo.Status = "pending"
		todo.CompletedAt = nil
	}

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	return todo, nil
}

func (s *TodoService) SyncToEvent(ctx context.Context, userID, workspaceID, id uint) (*model.Event, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}

	event := &model.Event{
		UserID:      userID,
		WorkspaceID: workspaceID,
		Title:       todo.Title,
		Description: todo.Description,
		ContactIDs:  todo.ContactIDs,
		Color:       todo.Color,
	}

	if todo.DueTime != nil {
		event.StartTime = *todo.DueTime
	} else {
		event.StartTime = time.Now()
	}

	if err := s.eventRepo.Create(ctx, event); err != nil {
		return nil, err
	}
	return event, nil
}

func (s *TodoService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}
