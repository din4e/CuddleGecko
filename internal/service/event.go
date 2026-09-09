package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrEventNotFound = errors.New("event not found")

type EventRepository interface {
	Create(ctx context.Context, event *model.Event) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Event, error)
	GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Event, error)
	List(ctx context.Context, workspaceID uint, page, pageSize int, startAfter, endBefore *string, search string, tagIDs []uint) ([]model.Event, int64, error)
	Update(ctx context.Context, event *model.Event) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type EventService struct {
	repo        EventRepository
	taggingRepo TaggingRepository
	notifier    ChangeNotifier
}

func NewEventService(repo EventRepository, taggingRepo TaggingRepository, notifier ...ChangeNotifier) *EventService {
	return &EventService{repo: repo, taggingRepo: taggingRepo, notifier: firstNotifier(notifier)}
}

func (s *EventService) Create(ctx context.Context, userID, workspaceID uint, event *model.Event) (*model.Event, error) {
	event.UserID = userID
	event.WorkspaceID = workspaceID
	if err := validateEvent(event); err != nil {
		return nil, err
	}
	if err := s.repo.Create(ctx, event); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceEvent, ChangeCreated, event.ID, event)
	return event, nil
}

func (s *EventService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Event, error) {
	event, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, err
	}
	s.populateTags(ctx, workspaceID, []*model.Event{event})
	return event, nil
}

func (s *EventService) List(ctx context.Context, userID, workspaceID uint, page, pageSize int, startAfter, endBefore *string, search string, tagIDs []uint) ([]model.Event, int64, error) {
	events, total, err := s.repo.List(ctx, workspaceID, page, pageSize, startAfter, endBefore, search, tagIDs)
	if err != nil {
		return nil, 0, err
	}
	ptrs := make([]*model.Event, len(events))
	for i := range events {
		ptrs[i] = &events[i]
	}
	s.populateTags(ctx, workspaceID, ptrs)
	return events, total, nil
}

func (s *EventService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Event) (*model.Event, error) {
	event, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrEventNotFound
	}

	if updates.Title != "" {
		event.Title = updates.Title
	}
	event.Description = updates.Description
	if !updates.StartTime.IsZero() {
		event.StartTime = updates.StartTime
	}
	event.EndTime = updates.EndTime
	event.Location = updates.Location
	event.ContactIDs = updates.ContactIDs
	event.Color = updates.Color

	if err := validateEvent(event); err != nil {
		return nil, err
	}
	if err := s.repo.Update(ctx, event); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceEvent, ChangeUpdated, event.ID, event)
	return event, nil
}

func (s *EventService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	// Clean up dangling tag associations.
	_ = s.taggingRepo.RemoveAll(ctx, workspaceID, model.TagTargetEvent, id)
	notifyChange(ctx, s.notifier, workspaceID, ResourceEvent, ChangeDeleted, id, nil)
	return nil
}

func (s *EventService) ReplaceTags(ctx context.Context, userID, workspaceID, eventID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, eventID); err != nil {
		return ErrEventNotFound
	}
	if err := s.taggingRepo.SetTags(ctx, workspaceID, model.TagTargetEvent, eventID, tagIDs); err != nil {
		return err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceEvent, ChangeUpdated, eventID, nil)
	return nil
}

func (s *EventService) GetTags(ctx context.Context, userID, workspaceID, eventID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, workspaceID, eventID); err != nil {
		return nil, ErrEventNotFound
	}
	return s.taggingRepo.GetTags(ctx, workspaceID, model.TagTargetEvent, eventID)
}

// populateTags fills the virtual Tags field for a batch of events.
func (s *EventService) populateTags(ctx context.Context, workspaceID uint, events []*model.Event) {
	if s.taggingRepo == nil || len(events) == 0 {
		return
	}
	ids := make([]uint, len(events))
	for i, e := range events {
		ids[i] = e.ID
	}
	tagMap, err := s.taggingRepo.GetTagsByTargets(ctx, workspaceID, model.TagTargetEvent, ids)
	if err != nil {
		return
	}
	for _, e := range events {
		e.Tags = tagMap[e.ID]
	}
}
