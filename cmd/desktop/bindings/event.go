package bindings

import (
	"context"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type EventBinding struct {
	svc *service.EventService
}

func (b *EventBinding) List(input ListEventsInput) (*PaginatedEvents, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	var startAfter, endBefore *string
	if input.StartAfter != "" {
		startAfter = &input.StartAfter
	}
	if input.EndBefore != "" {
		endBefore = &input.EndBefore
	}

	events, total, err := b.svc.List(ctx, userID, input.Page, input.PageSize, startAfter, endBefore)
	if err != nil {
		return nil, err
	}

	return &PaginatedEvents{
		Items:    events,
		Total:    total,
		Page:     input.Page,
		PageSize: input.PageSize,
	}, nil
}

func (b *EventBinding) Create(input CreateEventInput) (*model.Event, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	startTime, _ := time.Parse(time.RFC3339, input.StartTime)
	var endTime *time.Time
	if input.EndTime != "" {
		t, _ := time.Parse(time.RFC3339, input.EndTime)
		endTime = &t
	}

	event := &model.Event{
		Title:       input.Title,
		Description: input.Description,
		StartTime:   startTime,
		EndTime:     endTime,
		Location:    input.Location,
		ContactIDs:  input.ContactIDs,
		Color:       input.Color,
	}

	return b.svc.Create(ctx, userID, event)
}

func (b *EventBinding) Update(id uint, input UpdateEventInput) (*model.Event, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	startTime, _ := time.Parse(time.RFC3339, input.StartTime)
	var endTime *time.Time
	if input.EndTime != "" {
		t, _ := time.Parse(time.RFC3339, input.EndTime)
		endTime = &t
	}

	updates := &model.Event{
		Title:       input.Title,
		Description: input.Description,
		StartTime:   startTime,
		EndTime:     endTime,
		Location:    input.Location,
		ContactIDs:  input.ContactIDs,
		Color:       input.Color,
	}

	return b.svc.Update(ctx, userID, id, updates)
}

func (b *EventBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, id)
}
