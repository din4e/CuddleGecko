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
	// An OR across two columns can't be served by one index and often degrades to
	// a scan; UNION two index-backed SELECTs (idx_relation_a / idx_relation_b)
	// instead. UNION dedups, matching the OR result (including self-relations).
	if err := r.db.WithContext(ctx).Raw(
		"SELECT * FROM contact_relations WHERE workspace_id = ? AND contact_id_a = ? "+
			"UNION "+
			"SELECT * FROM contact_relations WHERE workspace_id = ? AND contact_id_b = ?",
		workspaceID, contactID, workspaceID, contactID,
	).Scan(&relations).Error; err != nil {
		return nil, fmt.Errorf("list relations: %w", err)
	}
	return relations, nil
}

func (r *RelationRepo) ListByContactIDs(ctx context.Context, workspaceID uint, contactIDs []uint) ([]model.ContactRelation, error) {
	var relations []model.ContactRelation
	if len(contactIDs) == 0 {
		return relations, nil
	}
	// Same OR-vs-index problem as ListByContact; UNION two indexed IN scans.
	if err := r.db.WithContext(ctx).Raw(
		"SELECT * FROM contact_relations WHERE workspace_id = ? AND contact_id_a IN ? "+
			"UNION "+
			"SELECT * FROM contact_relations WHERE workspace_id = ? AND contact_id_b IN ?",
		workspaceID, contactIDs, workspaceID, contactIDs,
	).Scan(&relations).Error; err != nil {
		return nil, fmt.Errorf("list relations by contact ids: %w", err)
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
