package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type InteractionRepo struct {
	db *gorm.DB
}

func NewInteractionRepo(db *gorm.DB) *InteractionRepo {
	return &InteractionRepo{db: db}
}

func (r *InteractionRepo) Create(ctx context.Context, interaction *model.Interaction) error {
	if err := r.db.WithContext(ctx).Create(interaction).Error; err != nil {
		return fmt.Errorf("create interaction: %w", err)
	}
	return nil
}

func (r *InteractionRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Interaction, error) {
	var interaction model.Interaction
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&interaction).Error; err != nil {
		return nil, err
	}
	return &interaction, nil
}

func (r *InteractionRepo) ListByContact(ctx context.Context, workspaceID, contactID uint, page, pageSize int) ([]model.Interaction, int64, error) {
	var interactions []model.Interaction
	var total int64

	query := r.db.WithContext(ctx).Where("workspace_id = ? AND contact_id = ?", workspaceID, contactID)

	if err := query.Model(&model.Interaction{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count interactions: %w", err)
	}

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("occurred_at DESC").
		Find(&interactions).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list interactions: %w", err)
	}

	return interactions, total, nil
}

func (r *InteractionRepo) Update(ctx context.Context, interaction *model.Interaction) error {
	if err := r.db.WithContext(ctx).Save(interaction).Error; err != nil {
		return fmt.Errorf("update interaction: %w", err)
	}
	return nil
}

func (r *InteractionRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Interaction{}).Error; err != nil {
		return fmt.Errorf("delete interaction: %w", err)
	}
	return nil
}
