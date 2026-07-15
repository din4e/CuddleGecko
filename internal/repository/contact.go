package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type ContactRepo struct {
	db *gorm.DB
}

func NewContactRepo(db *gorm.DB) *ContactRepo {
	return &ContactRepo{db: db}
}

func (r *ContactRepo) Create(ctx context.Context, contact *model.Contact) error {
	if err := r.db.WithContext(ctx).Create(contact).Error; err != nil {
		return fmt.Errorf("create contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Contact, error) {
	var contact model.Contact
	err := r.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		First(&contact).Error
	if err != nil {
		return nil, err
	}
	return &contact, nil
}

func (r *ContactRepo) GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Contact, error) {
	var contacts []model.Contact
	err := r.db.WithContext(ctx).
		Where("id IN ? AND workspace_id = ?", ids, workspaceID).
		Find(&contacts).Error
	if err != nil {
		return nil, fmt.Errorf("get contacts by ids: %w", err)
	}
	return contacts, nil
}

func (r *ContactRepo) List(ctx context.Context, workspaceID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	var contacts []model.Contact
	var total int64

	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)

	if search != "" {
		query = query.Where("name LIKE ? OR nickname LIKE ? OR email LIKE ? OR phone LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if len(tagIDs) > 0 {
		// EXISTS avoids duplicate contact rows when multiple selected tags match.
		query = query.Where(
			"EXISTS (SELECT 1 FROM taggings WHERE taggings.workspace_id = ? AND taggings.target_type = ? AND taggings.target_id = contacts.id AND taggings.tag_id IN ?)",
			workspaceID, model.TagTargetContact, tagIDs,
		)
	}

	if err := query.Model(&model.Contact{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count contacts: %w", err)
	}

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("created_at DESC").
		Find(&contacts).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list contacts: %w", err)
	}

	return contacts, total, nil
}

func (r *ContactRepo) Update(ctx context.Context, contact *model.Contact) error {
	if err := r.db.WithContext(ctx).Model(&model.Contact{ID: contact.ID}).
		Select("name", "nickname", "avatar_emoji", "avatar_url", "phone", "email", "birthday", "notes", "relationship_labels").
		Updates(contact).Error; err != nil {
		return fmt.Errorf("update contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Contact{}).Error; err != nil {
		return fmt.Errorf("delete contact: %w", err)
	}
	return nil
}
