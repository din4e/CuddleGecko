package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrEventNotFound = errors.New("event not found")

type EventRepository interface {
	Create(ctx context.Context, event *model.Event) error
	GetByID(ctx context.Context, userID, id uint) (*model.Event, error)
	List(ctx context.Context, userID uint, page, pageSize int, startAfter, endBefore *string) ([]model.Event, int64, error)
	Update(ctx context.Context, event *model.Event) error
	Delete(ctx context.Context, userID, id uint) error
}

type EventService struct {
	repo EventRepository
}

func NewEventService(repo EventRepository) *EventService {
	return &EventService{repo: repo}
}

func (s *EventService) Create(ctx context.Context, userID uint, event *model.Event) (*model.Event, error) {
	event.UserID = userID
	if err := s.repo.Create(ctx, event); err != nil {
		return nil, err
	}
	return event, nil
}

func (s *EventService) GetByID(ctx context.Context, userID, id uint) (*model.Event, error) {
	return s.repo.GetByID(ctx, userID, id)
}

func (s *EventService) List(ctx context.Context, userID uint, page, pageSize int, startAfter, endBefore *string) ([]model.Event, int64, error) {
	return s.repo.List(ctx, userID, page, pageSize, startAfter, endBefore)
}

func (s *EventService) Update(ctx context.Context, userID, id uint, updates *model.Event) (*model.Event, error) {
	event, err := s.repo.GetByID(ctx, userID, id)
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

	if err := s.repo.Update(ctx, event); err != nil {
		return nil, err
	}
	return event, nil
}

func (s *EventService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}
