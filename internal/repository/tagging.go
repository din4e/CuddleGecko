package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// TaggingRepo manages polymorphic tag associations via the taggings table.
type TaggingRepo struct {
	db *gorm.DB
}

func NewTaggingRepo(db *gorm.DB) *TaggingRepo {
	return &TaggingRepo{db: db}
}

// SetTags replaces the full set of tags attached to a target. Duplicates and
// zero IDs are ignored.
func (r *TaggingRepo) SetTags(ctx context.Context, workspaceID uint, targetType string, targetID uint, tagIDs []uint) error {
	tx := r.db.WithContext(ctx).Begin()
	if err := tx.Where("workspace_id = ? AND target_type = ? AND target_id = ?", workspaceID, targetType, targetID).
		Delete(&model.Tagging{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("clear taggings: %w", err)
	}

	seen := make(map[uint]bool, len(tagIDs))
	for _, id := range tagIDs {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		if err := tx.Create(&model.Tagging{
			WorkspaceID: workspaceID,
			TagID:       id,
			TargetType:  targetType,
			TargetID:    targetID,
		}).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("create tagging: %w", err)
		}
	}
	return tx.Commit().Error
}

// GetTags returns the tags attached to a single target.
func (r *TaggingRepo) GetTags(ctx context.Context, workspaceID uint, targetType string, targetID uint) ([]model.Tag, error) {
	var tags []model.Tag
	err := r.db.WithContext(ctx).
		Joins("JOIN taggings ON taggings.tag_id = tags.id").
		Where("taggings.workspace_id = ? AND taggings.target_type = ? AND taggings.target_id = ?", workspaceID, targetType, targetID).
		Order("tags.id ASC").
		Find(&tags).Error
	if err != nil {
		return nil, fmt.Errorf("get tags: %w", err)
	}
	return tags, nil
}

// GetTagsByTargets batch-loads tags for many targets, returning targetID -> tags.
func (r *TaggingRepo) GetTagsByTargets(ctx context.Context, workspaceID uint, targetType string, targetIDs []uint) (map[uint][]model.Tag, error) {
	result := make(map[uint][]model.Tag, len(targetIDs))
	if len(targetIDs) == 0 {
		return result, nil
	}

	var tgs []model.Tagging
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND target_type = ? AND target_id IN ?", workspaceID, targetType, targetIDs).
		Order("target_id ASC").
		Find(&tgs).Error; err != nil {
		return nil, fmt.Errorf("list taggings: %w", err)
	}
	if len(tgs) == 0 {
		return result, nil
	}

	tagIDSet := make(map[uint]bool, len(tgs))
	for _, t := range tgs {
		tagIDSet[t.TagID] = true
	}
	tagIDs := make([]uint, 0, len(tagIDSet))
	for id := range tagIDSet {
		tagIDs = append(tagIDs, id)
	}

	var tags []model.Tag
	if err := r.db.WithContext(ctx).Where("id IN ?", tagIDs).Order("id ASC").Find(&tags).Error; err != nil {
		return nil, fmt.Errorf("get tags by ids: %w", err)
	}
	tagMap := make(map[uint]model.Tag, len(tags))
	for _, t := range tags {
		tagMap[t.ID] = t
	}
	for _, t := range tgs {
		if tag, ok := tagMap[t.TagID]; ok {
			result[t.TargetID] = append(result[t.TargetID], tag)
		}
	}
	return result, nil
}

// FilterTargetIDs returns the distinct target IDs that carry any of the given tags.
func (r *TaggingRepo) FilterTargetIDs(ctx context.Context, workspaceID uint, targetType string, tagIDs []uint) ([]uint, error) {
	if len(tagIDs) == 0 {
		return nil, nil
	}
	var ids []uint
	err := r.db.WithContext(ctx).Model(&model.Tagging{}).
		Where("workspace_id = ? AND target_type = ? AND tag_id IN ?", workspaceID, targetType, tagIDs).
		Distinct("target_id").
		Pluck("target_id", &ids).Error
	if err != nil {
		return nil, fmt.Errorf("filter targets by tags: %w", err)
	}
	return ids, nil
}

// RemoveAll deletes every tagging for a target (call when the target is deleted).
func (r *TaggingRepo) RemoveAll(ctx context.Context, workspaceID uint, targetType string, targetID uint) error {
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND target_type = ? AND target_id = ?", workspaceID, targetType, targetID).
		Delete(&model.Tagging{}).Error; err != nil {
		return fmt.Errorf("remove taggings: %w", err)
	}
	return nil
}
