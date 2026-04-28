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

func (r *ReminderRepo) List(ctx context.Context, workspaceID uint, status model.ReminderStatus) ([]model.Reminder, error) {
	var reminders []model.Reminder
	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Order("remind_at ASC").Find(&reminders).Error; err != nil {
		return nil, fmt.Errorf("list reminders: %w", err)
	}
	return reminders, nil
}

func (r *ReminderRepo) Update(ctx context.Context, reminder *model.Reminder) error {
	if err := r.db.WithContext(ctx).Save(reminder).Error; err != nil {
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
