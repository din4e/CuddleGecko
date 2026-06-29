package model

import "time"

// UserSetting is a per-user key-value setting (e.g. sidebar nav layout).
// Column "name" (not "key") avoids the MySQL reserved word.
type UserSetting struct {
	ID        uint      `gorm:"primaryKey"`
	UserID    uint      `gorm:"uniqueIndex:idx_user_setting_key"`
	Name      string    `gorm:"uniqueIndex:idx_user_setting_key;size:64"`
	Value     string
	UpdatedAt time.Time
}
