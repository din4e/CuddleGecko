package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type RelationRepo struct {
	db *gorm.DB
}

func NewRelationRepo(db *gorm.DB) *RelationRepo {
	return &RelationRepo{db: db}
}

func (r *RelationRepo) Create(ctx context.Context, relation *model.ContactRelation) error {
	if err := r.db.WithContext(ctx).Create(relation).Error; err != nil {
		return fmt.Errorf("create relation: %w", err)
	}
	return nil
}

func (r *RelationRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.ContactRelation, error) {
	var relation model.ContactRelation
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&relation).Error; err != nil {
		return nil, err
	}
	return &relation, nil
}

func (r *RelationRepo) ListByContact(ctx context.Context, workspaceID, contactID uint) ([]model.ContactRelation, error) {
	var relations []model.ContactRelation
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (contact_id_a = ? OR contact_id_b = ?)", workspaceID, contactID, contactID).
		Find(&relations).Error; err != nil {
		return nil, fmt.Errorf("list relations: %w", err)
	}
	return relations, nil
}

func (r *RelationRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.ContactRelation{}).Error; err != nil {
		return fmt.Errorf("delete relation: %w", err)
	}
	return nil
}

func (r *RelationRepo) GetAllByWorkspace(ctx context.Context, workspaceID uint) ([]model.ContactRelation, error) {
	var relations []model.ContactRelation
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Find(&relations).Error; err != nil {
		return nil, fmt.Errorf("get all relations: %w", err)
	}
	return relations, nil
}
