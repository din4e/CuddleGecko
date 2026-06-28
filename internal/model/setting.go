package model

import "time"

// Setting is a generic key-value application setting (e.g. captcha config),
// persisted across restarts. Value holds JSON for structured settings.
// Column is "setting_key" (not "key") to avoid the MySQL reserved word.
type Setting struct {
	SettingKey string `gorm:"column:setting_key;primaryKey"`
	Value      string
	UpdatedAt  time.Time
}
