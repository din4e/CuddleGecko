package repository

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type SettingRepo struct {
	db *gorm.DB
}

func NewSettingRepo(db *gorm.DB) *SettingRepo {
	return &SettingRepo{db: db}
}

// Get returns the setting value and whether it exists.
func (r *SettingRepo) Get(ctx context.Context, key string) (string, bool, error) {
	var s model.Setting
	err := r.db.WithContext(ctx).First(&s, "setting_key = ?", key).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return s.Value, true, nil
}

// Set upserts a setting by key.
func (r *SettingRepo) Set(ctx context.Context, key, value string) error {
	s := model.Setting{SettingKey: key, Value: value}
	return r.db.WithContext(ctx).Save(&s).Error
}
