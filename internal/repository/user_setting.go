package repository

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type UserSettingRepo struct {
	db *gorm.DB
}

func NewUserSettingRepo(db *gorm.DB) *UserSettingRepo {
	return &UserSettingRepo{db: db}
}

// Get returns the user's setting value and whether it exists.
func (r *UserSettingRepo) Get(ctx context.Context, userID uint, name string) (string, bool, error) {
	var s model.UserSetting
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND name = ?", userID, name).First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return s.Value, true, nil
}

// Set upserts a user setting by (userID, name).
func (r *UserSettingRepo) Set(ctx context.Context, userID uint, name, value string) error {
	var s model.UserSetting
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND name = ?", userID, name).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r.db.WithContext(ctx).Create(&model.UserSetting{UserID: userID, Name: name, Value: value}).Error
	}
	if err != nil {
		return err
	}
	return r.db.WithContext(ctx).Model(&s).Update("value", value).Error
}
