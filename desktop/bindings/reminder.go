package bindings

import (
	"context"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type ReminderBinding struct {
	svc *service.ReminderService
}

func (b *ReminderBinding) List(status string) ([]model.Reminder, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.List(ctx, userID, workspaceID, model.ReminderStatus(status))
}

func (b *ReminderBinding) Create(contactID uint, input CreateReminderInput) (*model.Reminder, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	remindAt, _ := time.Parse(time.RFC3339, input.RemindAt)
	reminder := &model.Reminder{
		Title:       input.Title,
		Description: input.Description,
		RemindAt:    remindAt,
	}
	return b.svc.Create(ctx, userID, workspaceID, contactID, reminder)
}

func (b *ReminderBinding) Update(id uint, input UpdateReminderInput) (*model.Reminder, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	remindAt, _ := time.Parse(time.RFC3339, input.RemindAt)
	updates := &model.Reminder{
		Title:       input.Title,
		Description: input.Description,
		RemindAt:    remindAt,
		Status:      model.ReminderStatus(input.Status),
	}
	return b.svc.Update(ctx, userID, workspaceID, id, updates)
}

func (b *ReminderBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, workspaceID, id)
}
