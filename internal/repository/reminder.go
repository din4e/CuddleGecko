package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type ReminderRepo struct {
	db *gorm.DB
}

func NewReminderRepo(db *gorm.DB) *ReminderRepo {
	return &ReminderRepo{db: db}
}

func (r *ReminderRepo) Create(ctx context.Context, reminder *model.Reminder) error {
	if err := r.db.WithContext(ctx).Create(reminder).Error; err != nil {
		return fmt.Errorf("create reminder: %w", err)
	}
	return nil
}

func (r *ReminderRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Reminder, error) {
	var reminder model.Reminder
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&reminder).Error; err != nil {
		return nil, err
	}
	return &reminder, nil
}

func (r *ReminderRepo) List(ctx context.Context, workspaceID uint, status model.ReminderStatus, page, pageSize int) ([]model.Reminder, int64, error) {
	var reminders []model.Reminder
	query := r.db.WithContext(ctx).Model(&model.Reminder{}).Where("workspace_id = ?", workspaceID)
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count reminders: %w", err)
	}

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	if err := query.Order("remind_at ASC").Limit(pageSize).Offset(offset).Find(&reminders).Error; err != nil {
		return nil, 0, fmt.Errorf("list reminders: %w", err)
	}
	return reminders, total, nil
}

func (r *ReminderRepo) Update(ctx context.Context, reminder *model.Reminder) error {
	if err := r.db.WithContext(ctx).Model(&model.Reminder{ID: reminder.ID}).
		Select("title", "description", "remind_at", "status").
		Updates(reminder).Error; err != nil {
		return fmt.Errorf("update reminder: %w", err)
	}
	return nil
}

func (r *ReminderRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Reminder{}).Error; err != nil {
		return fmt.Errorf("delete reminder: %w", err)
	}
	return nil
}
