package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrReminderNotFound = errors.New("reminder not found")

type ReminderRepository interface {
	Create(ctx context.Context, reminder *model.Reminder) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Reminder, error)
	List(ctx context.Context, workspaceID uint, status model.ReminderStatus, contactID *uint, page, pageSize int) ([]model.Reminder, int64, error)
	Update(ctx context.Context, reminder *model.Reminder) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type ReminderService struct {
	repo     ReminderRepository
	notifier ChangeNotifier
}

func NewReminderService(repo ReminderRepository, notifier ...ChangeNotifier) *ReminderService {
	return &ReminderService{repo: repo, notifier: firstNotifier(notifier)}
}

func (s *ReminderService) Create(ctx context.Context, userID, workspaceID, contactID uint, reminder *model.Reminder) (*model.Reminder, error) {
	if reminder.RemindAt.IsZero() {
		return nil, fmt.Errorf("%w: remind_at is required", ErrInvalidReminder)
	}
	reminder.UserID = userID
	reminder.WorkspaceID = workspaceID
	reminder.ContactID = contactID
	reminder.Status = model.ReminderPending
	if err := s.repo.Create(ctx, reminder); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceReminder, ChangeCreated, reminder.ID, reminder)
	return reminder, nil
}

func (s *ReminderService) List(ctx context.Context, userID, workspaceID uint, status model.ReminderStatus, contactID *uint, page, pageSize int) ([]model.Reminder, int64, error) {
	return s.repo.List(ctx, workspaceID, status, contactID, page, pageSize)
}

func (s *ReminderService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Reminder) (*model.Reminder, error) {
	reminder, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrReminderNotFound
	}

	if updates.Title != "" {
		reminder.Title = updates.Title
	}
	reminder.Description = updates.Description
	if !updates.RemindAt.IsZero() {
		reminder.RemindAt = updates.RemindAt
	}
	if updates.Status != "" {
		reminder.Status = updates.Status
	}
	if err := validateReminderStatus(reminder.Status); err != nil {
		return nil, err
	}

	if err := s.repo.Update(ctx, reminder); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceReminder, ChangeUpdated, reminder.ID, reminder)
	return reminder, nil
}

func (s *ReminderService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceReminder, ChangeDeleted, id, nil)
	return nil
}
