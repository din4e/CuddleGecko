package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrInteractionNotFound = errors.New("interaction not found")

type InteractionRepository interface {
	Create(ctx context.Context, interaction *model.Interaction) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Interaction, error)
	ListByContact(ctx context.Context, workspaceID, contactID uint, page, pageSize int) ([]model.Interaction, int64, error)
	Update(ctx context.Context, interaction *model.Interaction) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type InteractionService struct {
	repo InteractionRepository
}

func NewInteractionService(repo InteractionRepository) *InteractionService {
	return &InteractionService{repo: repo}
}

func (s *InteractionService) Create(ctx context.Context, userID, workspaceID, contactID uint, interaction *model.Interaction) (*model.Interaction, error) {
	interaction.UserID = userID
	interaction.WorkspaceID = workspaceID
	interaction.ContactID = contactID
	if err := s.repo.Create(ctx, interaction); err != nil {
		return nil, err
	}
	return interaction, nil
}

func (s *InteractionService) ListByContact(ctx context.Context, userID, workspaceID, contactID uint, page, pageSize int) ([]model.Interaction, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.ListByContact(ctx, workspaceID, contactID, page, pageSize)
}

func (s *InteractionService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Interaction) (*model.Interaction, error) {
	interaction, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrInteractionNotFound
	}

	if updates.Title != "" {
		interaction.Title = updates.Title
	}
	if updates.Type != "" {
		interaction.Type = updates.Type
	}
	interaction.Content = updates.Content
	if !updates.OccurredAt.IsZero() {
		interaction.OccurredAt = updates.OccurredAt
	}

	if err := s.repo.Update(ctx, interaction); err != nil {
		return nil, err
	}
	return interaction, nil
}

func (s *InteractionService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}
