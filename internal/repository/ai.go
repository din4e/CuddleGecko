package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type AIRepo struct {
	db *gorm.DB
}

func NewAIRepo(db *gorm.DB) *AIRepo {
	return &AIRepo{db: db}
}

// Provider methods

func (r *AIRepo) CreateProvider(ctx context.Context, p *model.AIProvider) error {
	if err := r.db.WithContext(ctx).Create(p).Error; err != nil {
		return fmt.Errorf("create ai provider: %w", err)
	}
	return nil
}

func (r *AIRepo) GetProviderByID(ctx context.Context, userID, id uint) (*model.AIProvider, error) {
	var p model.AIProvider
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *AIRepo) GetActiveProvider(ctx context.Context, userID uint) (*model.AIProvider, error) {
	var p model.AIProvider
	if err := r.db.WithContext(ctx).Where("user_id = ? AND is_active = ?", userID, true).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *AIRepo) ListProviders(ctx context.Context, userID uint) ([]model.AIProvider, error) {
	var providers []model.AIProvider
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&providers).Error; err != nil {
		return nil, fmt.Errorf("list ai providers: %w", err)
	}
	return providers, nil
}

func (r *AIRepo) UpdateProvider(ctx context.Context, p *model.AIProvider) error {
	if err := r.db.WithContext(ctx).Save(p).Error; err != nil {
		return fmt.Errorf("update ai provider: %w", err)
	}
	return nil
}

func (r *AIRepo) DeactivateAllProviders(ctx context.Context, userID uint) error {
	if err := r.db.WithContext(ctx).Model(&model.AIProvider{}).Where("user_id = ?", userID).Update("is_active", false).Error; err != nil {
		return fmt.Errorf("deactivate providers: %w", err)
	}
	return nil
}

func (r *AIRepo) GetProviderByType(ctx context.Context, userID uint, providerType string) (*model.AIProvider, error) {
	var p model.AIProvider
	if err := r.db.WithContext(ctx).Where("user_id = ? AND provider_type = ?", userID, providerType).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

// Conversation methods

func (r *AIRepo) CreateConversation(ctx context.Context, c *model.AIConversation) error {
	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		return fmt.Errorf("create ai conversation: %w", err)
	}
	return nil
}

func (r *AIRepo) GetConversationByID(ctx context.Context, userID, id uint) (*model.AIConversation, error) {
	var c model.AIConversation
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *AIRepo) ListConversations(ctx context.Context, userID uint, page, pageSize int) ([]model.AIConversation, int64, error) {
	var conversations []model.AIConversation
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ?", userID)

	if err := query.Model(&model.AIConversation{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count conversations: %w", err)
	}

	offset := (page - 1) * pageSize
	if err := query.Offset(offset).Limit(pageSize).Order("updated_at DESC").Find(&conversations).Error; err != nil {
		return nil, 0, fmt.Errorf("list conversations: %w", err)
	}

	return conversations, total, nil
}

func (r *AIRepo) DeleteConversation(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.AIConversation{}).Error; err != nil {
		return fmt.Errorf("delete conversation: %w", err)
	}
	return nil
}

// Message methods

func (r *AIRepo) CreateMessage(ctx context.Context, m *model.AIMessage) error {
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return fmt.Errorf("create ai message: %w", err)
	}
	return nil
}

func (r *AIRepo) ListMessagesByConversation(ctx context.Context, conversationID uint) ([]model.AIMessage, error) {
	var messages []model.AIMessage
	if err := r.db.WithContext(ctx).Where("conversation_id = ?", conversationID).Order("created_at ASC").Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	return messages, nil
}
