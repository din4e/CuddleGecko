package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type AIBinding struct {
	svc *service.AIService
}

func (b *AIBinding) ListProviders() ([]model.AIProvider, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.ListProviders(ctx, userID)
}

func (b *AIBinding) SaveProvider(input SaveProviderInput) (*model.AIProvider, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.SaveProvider(ctx, userID, input.ProviderType, input.APIKey, input.Model, input.BaseURL)
}

func (b *AIBinding) ActivateProvider(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.ActivateProvider(ctx, userID, id)
}

func (b *AIBinding) TestConnection(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.TestConnection(ctx, userID, id)
}

func (b *AIBinding) ListConversations(page, pageSize int) (*PaginatedConversations, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	conversations, total, err := b.svc.ListConversations(ctx, userID, page, pageSize)
	if err != nil {
		return nil, err
	}
	return &PaginatedConversations{
		Items:    conversations,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func (b *AIBinding) CreateConversation(title string) (*model.AIConversation, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.CreateConversation(ctx, userID, title)
}

func (b *AIBinding) GetMessages(conversationID uint) ([]model.AIMessage, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.GetMessages(ctx, userID, conversationID)
}

func (b *AIBinding) DeleteConversation(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.DeleteConversation(ctx, userID, id)
}

func (b *AIBinding) Chat(conversationID uint, message string) (string, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return "", ErrNotAuthenticated
	}
	return b.svc.Chat(ctx, userID, conversationID, message)
}

func (b *AIBinding) AnalyzeRelationship(contactID uint) (string, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return "", ErrNotAuthenticated
	}
	return b.svc.AnalyzeRelationship(ctx, userID, contactID)
}

func (b *AIBinding) AnalyzeEvent(eventID uint) (string, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return "", ErrNotAuthenticated
	}
	return b.svc.AnalyzeEvent(ctx, userID, eventID)
}

func (b *AIBinding) ListPresets() []service.ProviderPreset {
	return service.ProviderPresets
}
