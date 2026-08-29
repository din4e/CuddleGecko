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

	page, pageSize = clampPage(page, pageSize)
	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("created_at DESC").
		Find(&contacts).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list contacts: %w", err)
	}

	return contacts, total, nil
}

// ListGraphContacts returns only the columns the relationship graph needs
// (id, name, relationship labels, avatar) — without the Tags Preload that List
// runs as a second query and the graph then discards. Capped at the same 1000
// the previous call used.
func (r *ContactRepo) ListGraphContacts(ctx context.Context, workspaceID uint) ([]model.Contact, error) {
	var contacts []model.Contact
	if err := r.db.WithContext(ctx).
		Select("id, name, relationship_labels, avatar_emoji, avatar_url").
		Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").
		Limit(1000).
		Find(&contacts).Error; err != nil {
		return nil, fmt.Errorf("list graph contacts: %w", err)
	}
	return contacts, nil
}

func (r *ContactRepo) Update(ctx context.Context, contact *model.Contact) error {
	if err := r.db.WithContext(ctx).Model(&model.Contact{ID: contact.ID}).
		Select("name", "nickname", "avatar_emoji", "avatar_url", "phone", "email", "birthday", "birthday_calendar", "notes", "relationship_labels").
		Updates(contact).Error; err != nil {
		return fmt.Errorf("update contact: %w", err)
	}
	return nil
}

// ListWithBirthday returns every contact that has a birthday set. Unpaged by
// design: the birthday occurrence (especially lunar) is computed in Go, and a
// personal workspace's contact count fits comfortably in memory.
func (r *ContactRepo) ListWithBirthday(ctx context.Context, workspaceID uint) ([]model.Contact, error) {
	var contacts []model.Contact
	if err := r.db.WithContext(ctx).
		Select("id, name, nickname, avatar_emoji, avatar_url, birthday, birthday_calendar").
		Where("workspace_id = ? AND birthday IS NOT NULL", workspaceID).
		Order("created_at DESC").
		Find(&contacts).Error; err != nil {
		return nil, fmt.Errorf("list contacts with birthday: %w", err)
	}
	return contacts, nil
}

// ReplaceTags swaps the polymorphic tag associations of a contact in one
// transaction. Used by JSON import to restore tag links after re-creating
// contacts (by name → freshly-created tag id).
func (r *ContactRepo) ReplaceTags(ctx context.Context, contactID uint, tags []model.Tag) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("target_type = ? AND target_id = ?", model.TagTargetContact, contactID).
			Delete(&model.Tagging{}).Error; err != nil {
			return fmt.Errorf("clear contact taggings: %w", err)
		}
		for _, t := range tags {
			tagging := model.Tagging{WorkspaceID: t.WorkspaceID, TagID: t.ID, TargetType: model.TagTargetContact, TargetID: contactID}
			if err := tx.Create(&tagging).Error; err != nil {
				return fmt.Errorf("restore contact tagging: %w", err)
			}
		}
		return nil
	})
}

// GetTags returns the tags attached to a contact through the polymorphic
// tagging table.
func (r *ContactRepo) GetTags(ctx context.Context, workspaceID, contactID uint) ([]model.Tag, error) {
	var taggings []model.Tagging
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND target_type = ? AND target_id = ?", workspaceID, model.TagTargetContact, contactID).
		Find(&taggings).Error; err != nil {
		return nil, fmt.Errorf("load contact taggings: %w", err)
	}
	if len(taggings) == 0 {
		return nil, nil
	}
	tagIDs := make([]uint, len(taggings))
	for i, tg := range taggings {
		tagIDs[i] = tg.TagID
	}
	var tags []model.Tag
	if err := r.db.WithContext(ctx).Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
		return nil, fmt.Errorf("load contact tags: %w", err)
	}
	return tags, nil
}

func (r *ContactRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Contact{}).Error; err != nil {
		return fmt.Errorf("delete contact: %w", err)
	}
	return nil
}
