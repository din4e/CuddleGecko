package bindings

import (
	"context"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type TodoBinding struct {
	svc *service.TodoService
}

type CreateTodoInput struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	DueTime     string   `json:"due_time"`
	Amount      *float64 `json:"amount"`
	AmountType  string   `json:"amount_type"`
	ContactIDs  []uint   `json:"contact_ids"`
	Color       string   `json:"color"`
}

type UpdateTodoInput = CreateTodoInput

func (b *TodoBinding) List(status string) ([]model.Todo, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}
	todos, _, err := b.svc.List(ctx, userID, workspaceID, statusPtr, 1, 200)
	return todos, err
}

func (b *TodoBinding) Create(input CreateTodoInput) (*model.Todo, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	todo := &model.Todo{
		Title:       input.Title,
		Description: input.Description,
		Status:      input.Status,
		Priority:    input.Priority,
		Amount:      input.Amount,
		AmountType:  input.AmountType,
		ContactIDs:  input.ContactIDs,
		Color:       input.Color,
	}
	if input.DueTime != "" {
		t, err := time.Parse(time.RFC3339, input.DueTime)
		if err != nil {
			return nil, err
		}
		todo.DueTime = &t
	}

	return b.svc.Create(ctx, userID, workspaceID, todo)
}

func (b *TodoBinding) Update(id uint, input UpdateTodoInput) (*model.Todo, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	updates := &model.Todo{
		Title:       input.Title,
		Description: input.Description,
		Status:      input.Status,
		Priority:    input.Priority,
		Amount:      input.Amount,
		AmountType:  input.AmountType,
		ContactIDs:  input.ContactIDs,
		Color:       input.Color,
	}
	if input.DueTime != "" {
		t, err := time.Parse(time.RFC3339, input.DueTime)
		if err != nil {
			return nil, err
		}
		updates.DueTime = &t
	}

	return b.svc.Update(ctx, userID, workspaceID, id, updates)
}

func (b *TodoBinding) ToggleStatus(id uint) (*model.Todo, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.ToggleStatus(ctx, userID, workspaceID, id)
}

func (b *TodoBinding) SyncToEvent(id uint) (*model.Event, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.SyncToEvent(ctx, userID, workspaceID, id)
}

func (b *TodoBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, workspaceID, id)
}
