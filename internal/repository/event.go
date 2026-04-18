package repository

import (
	"context"
	"fmt"

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

func (r *EventRepo) GetByID(ctx context.Context, userID, id uint) (*model.Event, error) {
	var event model.Event
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&event).Error; err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *EventRepo) List(ctx context.Context, userID uint, page, pageSize int, startAfter, endBefore *string) ([]model.Event, int64, error) {
	var events []model.Event
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ?", userID)

	if startAfter != nil {
		query = query.Where("start_time >= ?", *startAfter)
	}
	if endBefore != nil {
		query = query.Where("start_time <= ?", *endBefore)
	}

	if err := query.Model(&model.Event{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count events: %w", err)
	}

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
	if err := r.db.WithContext(ctx).Save(event).Error; err != nil {
		return fmt.Errorf("update event: %w", err)
	}
	return nil
}

func (r *EventRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.Event{}).Error; err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	return nil
}
