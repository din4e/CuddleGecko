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
	List(ctx context.Context, workspaceID uint, status model.ReminderStatus, contactID *uint, page, pageSize int, tagIDs []uint) ([]model.Reminder, int64, error)
	Update(ctx context.Context, reminder *model.Reminder) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type ReminderService struct {
	repo        ReminderRepository
	taggingRepo TaggingRepository
	notifier    ChangeNotifier
}

func NewReminderService(repo ReminderRepository, taggingRepo TaggingRepository, notifier ...ChangeNotifier) *ReminderService {
	return &ReminderService{repo: repo, taggingRepo: taggingRepo, notifier: firstNotifier(notifier)}
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

func (s *ReminderService) List(ctx context.Context, userID, workspaceID uint, status model.ReminderStatus, contactID *uint, page, pageSize int, tagIDs []uint) ([]model.Reminder, int64, error) {
	reminders, total, err := s.repo.List(ctx, workspaceID, status, contactID, page, pageSize, tagIDs)
	if err != nil {
		return nil, 0, err
	}
	s.populateTags(ctx, workspaceID, reminders)
	return reminders, total, nil
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
	// Clean up dangling tag associations.
	_ = s.taggingRepo.RemoveAll(ctx, workspaceID, model.TagTargetReminder, id)
	notifyChange(ctx, s.notifier, workspaceID, ResourceReminder, ChangeDeleted, id, nil)
	return nil
}

func (s *ReminderService) ReplaceTags(ctx context.Context, userID, workspaceID, reminderID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, reminderID); err != nil {
		return ErrReminderNotFound
	}
	if err := s.taggingRepo.SetTags(ctx, workspaceID, model.TagTargetReminder, reminderID, tagIDs); err != nil {
		return err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceReminder, ChangeUpdated, reminderID, nil)
	return nil
}

func (s *ReminderService) GetTags(ctx context.Context, userID, workspaceID, reminderID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, workspaceID, reminderID); err != nil {
		return nil, ErrReminderNotFound
	}
	return s.taggingRepo.GetTags(ctx, workspaceID, model.TagTargetReminder, reminderID)
}

// populateTags fills the virtual Tags field for a batch of reminders.
func (s *ReminderService) populateTags(ctx context.Context, workspaceID uint, reminders []model.Reminder) {
	if s.taggingRepo == nil || len(reminders) == 0 {
		return
	}
	ids := make([]uint, len(reminders))
	for i, r := range reminders {
		ids[i] = r.ID
	}
	tagMap, err := s.taggingRepo.GetTagsByTargets(ctx, workspaceID, model.TagTargetReminder, ids)
	if err != nil {
		return
	}
	for i := range reminders {
		reminders[i].Tags = tagMap[reminders[i].ID]
	}
}
