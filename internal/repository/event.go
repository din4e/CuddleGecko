package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type EventRepo struct {
	db *gorm.DB
}

func NewEventRepo(db *gorm.DB) *EventRepo {
	return &EventRepo{db: db}
}

func (r *EventRepo) Create(ctx context.Context, event *model.Event) error {
	if err := r.db.WithContext(ctx).Create(event).Error; err != nil {
		return fmt.Errorf("create event: %w", err)
	}
	return nil
}

func (r *EventRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Event, error) {
	var event model.Event
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&event).Error; err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *EventRepo) GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Event, error) {
	var events []model.Event
	if err := r.db.WithContext(ctx).
		Where("id IN ? AND workspace_id = ?", ids, workspaceID).
		Find(&events).Error; err != nil {
		return nil, fmt.Errorf("get events by ids: %w", err)
	}
	return events, nil
}

func (r *EventRepo) List(ctx context.Context, workspaceID uint, page, pageSize int, startAfter, endBefore *string, search string) ([]model.Event, int64, error) {
	var events []model.Event
	var total int64

	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)

	if startAfter != nil {
		query = query.Where("start_time >= ?", *startAfter)
	}
	if endBefore != nil {
		query = query.Where("start_time <= ?", *endBefore)
	}
	if search != "" {
		query = query.Where("LOWER(title) LIKE ?", "%"+strings.ToLower(search)+"%")
	}

	if err := query.Model(&model.Event{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count events: %w", err)
	}

	page, pageSize = clampPage(page, pageSize)
	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("start_time DESC").
		Find(&events).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list events: %w", err)
	}

	return events, total, nil
}

func (r *EventRepo) Update(ctx context.Context, event *model.Event) error {
	if err := r.db.WithContext(ctx).Model(&model.Event{ID: event.ID}).
		Select("title", "description", "start_time", "end_time", "location", "contact_ids", "color").
		Updates(event).Error; err != nil {
		return fmt.Errorf("update event: %w", err)
	}
	return nil
}

func (r *EventRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Event{}).Error; err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	return nil
}
