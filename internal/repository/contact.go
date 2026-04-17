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

func (r *ContactRepo) GetByID(ctx context.Context, userID, id uint) (*model.Contact, error) {
	var contact model.Contact
	err := r.db.WithContext(ctx).Preload("Tags").
		Where("id = ? AND user_id = ?", id, userID).
		First(&contact).Error
	if err != nil {
		return nil, err
	}
	return &contact, nil
}

func (r *ContactRepo) List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	var contacts []model.Contact
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ?", userID)

	if search != "" {
		query = query.Where("name LIKE ? OR nickname LIKE ? OR email LIKE ? OR phone LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if len(tagIDs) > 0 {
		query = query.Joins("JOIN contact_tags ON contact_tags.contact_id = contacts.id").
			Where("contact_tags.tag_id IN ?", tagIDs)
	}

	if err := query.Model(&model.Contact{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count contacts: %w", err)
	}

	offset := (page - 1) * pageSize
	err := query.Preload("Tags").Offset(offset).Limit(pageSize).
		Order("created_at DESC").
		Find(&contacts).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list contacts: %w", err)
	}

	return contacts, total, nil
}

func (r *ContactRepo) Update(ctx context.Context, contact *model.Contact) error {
	if err := r.db.WithContext(ctx).Save(contact).Error; err != nil {
		return fmt.Errorf("update contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.Contact{}).Error; err != nil {
		return fmt.Errorf("delete contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) ReplaceTags(ctx context.Context, contactID uint, tags []model.Tag) error {
	contact := model.Contact{ID: contactID}
	if err := r.db.WithContext(ctx).Model(&contact).Association("Tags").Replace(tags); err != nil {
		return fmt.Errorf("replace contact tags: %w", err)
	}
	return nil
}

func (r *ContactRepo) GetTags(ctx context.Context, contactID uint) ([]model.Tag, error) {
	var tags []model.Tag
	contact := model.Contact{ID: contactID}
	if err := r.db.WithContext(ctx).Model(&contact).Association("Tags").Find(&tags); err != nil {
		return nil, fmt.Errorf("get contact tags: %w", err)
	}
	return tags, nil
}
