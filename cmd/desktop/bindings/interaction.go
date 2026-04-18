package bindings

import (
	"context"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type InteractionBinding struct {
	svc *service.InteractionService
}

func (b *InteractionBinding) ListByContact(contactID uint, page, pageSize int) (*PaginatedInteractions, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	items, total, err := b.svc.ListByContact(ctx, userID, contactID, page, pageSize)
	if err != nil {
		return nil, err
	}
	return &PaginatedInteractions{Items: items, Total: total}, nil
}

func (b *InteractionBinding) Create(contactID uint, input CreateInteractionInput) (*model.Interaction, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	occurredAt, _ := time.Parse(time.RFC3339, input.OccurredAt)
	interaction := &model.Interaction{
		Type:       model.InteractionType(input.Type),
		Title:      input.Title,
		Content:    input.Content,
		OccurredAt: occurredAt,
	}
	return b.svc.Create(ctx, userID, contactID, interaction)
}

func (b *InteractionBinding) Update(id uint, input UpdateInteractionInput) (*model.Interaction, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	occurredAt, _ := time.Parse(time.RFC3339, input.OccurredAt)
	updates := &model.Interaction{
		Type:       model.InteractionType(input.Type),
		Title:      input.Title,
		Content:    input.Content,
		OccurredAt: occurredAt,
	}
	return b.svc.Update(ctx, userID, id, updates)
}

func (b *InteractionBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, id)
}
