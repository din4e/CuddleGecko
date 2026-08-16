package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TagRepo struct {
	db *gorm.DB
}

func NewTagRepo(db *gorm.DB) *TagRepo {
	return &TagRepo{db: db}
}

func (r *TagRepo) Create(ctx context.Context, tag *model.Tag) error {
	if err := r.db.WithContext(ctx).Create(tag).Error; err != nil {
		return fmt.Errorf("create tag: %w", err)
	}
	return nil
}

func (r *TagRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Tag, error) {
	var tag model.Tag
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&tag).Error; err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *TagRepo) List(ctx context.Context, workspaceID uint, page, pageSize int) ([]model.Tag, int64, error) {
	var tags []model.Tag
	query := r.db.WithContext(ctx).Model(&model.Tag{}).Where("workspace_id = ?", workspaceID)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count tags: %w", err)
	}

	page, pageSize = clampPage(page, pageSize)
	offset := (page - 1) * pageSize

	if err := query.Order("id ASC").Limit(pageSize).Offset(offset).Find(&tags).Error; err != nil {
		return nil, 0, fmt.Errorf("list tags: %w", err)
	}
	return tags, total, nil
}

func (r *TagRepo) Update(ctx context.Context, tag *model.Tag) error {
	if err := r.db.WithContext(ctx).Model(&model.Tag{ID: tag.ID}).
		Select("name", "color").
		Updates(tag).Error; err != nil {
		return fmt.Errorf("update tag: %w", err)
	}
	return nil
}

func (r *TagRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Tag{}).Error; err != nil {
		return fmt.Errorf("delete tag: %w", err)
	}
	return nil
}

func (r *TagRepo) GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Tag, error) {
	var tags []model.Tag
	if err := r.db.WithContext(ctx).Where("workspace_id = ? AND id IN ?", workspaceID, ids).Find(&tags).Error; err != nil {
		return nil, fmt.Errorf("get tags by ids: %w", err)
	}
	return tags, nil
}
