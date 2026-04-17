package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrReminderNotFound = errors.New("reminder not found")

type ReminderRepository interface {
	Create(ctx context.Context, reminder *model.Reminder) error
	GetByID(ctx context.Context, userID, id uint) (*model.Reminder, error)
	List(ctx context.Context, userID uint, status model.ReminderStatus) ([]model.Reminder, error)
	Update(ctx context.Context, reminder *model.Reminder) error
	Delete(ctx context.Context, userID, id uint) error
}

type ReminderService struct {
	repo ReminderRepository
}

func NewReminderService(repo ReminderRepository) *ReminderService {
	return &ReminderService{repo: repo}
}

func (s *ReminderService) Create(ctx context.Context, userID, contactID uint, reminder *model.Reminder) (*model.Reminder, error) {
	reminder.UserID = userID
	reminder.ContactID = contactID
	reminder.Status = model.ReminderPending
	if err := s.repo.Create(ctx, reminder); err != nil {
		return nil, err
	}
	return reminder, nil
}

func (s *ReminderService) List(ctx context.Context, userID uint, status model.ReminderStatus) ([]model.Reminder, error) {
	return s.repo.List(ctx, userID, status)
}

func (s *ReminderService) Update(ctx context.Context, userID, id uint, updates *model.Reminder) (*model.Reminder, error) {
	reminder, err := s.repo.GetByID(ctx, userID, id)
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

	if err := s.repo.Update(ctx, reminder); err != nil {
		return nil, err
	}
	return reminder, nil
}

func (s *ReminderService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}
