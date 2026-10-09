package model

import (
	"time"

	"gorm.io/gorm"
)

// UserSetting is a per-user key-value setting (e.g. sidebar nav layout).
// Column "name" (not "key") avoids the MySQL reserved word.
type UserSetting struct {
	ID        string `gorm:"primaryKey;type:char(36)"`
	UserID    string `gorm:"size:36;uniqueIndex:idx_user_setting_key"`
	Name      string `gorm:"size:36;uniqueIndex:idx_user_setting_key;size:64"`
	Value     string
	UpdatedAt time.Time
}

// BeforeCreate assigns the UUID primary key on first insert.
func (u *UserSetting) BeforeCreate(tx *gorm.DB) error { return ensureID(&u.ID, tx) }
