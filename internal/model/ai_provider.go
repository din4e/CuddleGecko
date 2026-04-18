package model

import "time"

type AIProvider struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	ProviderType string    `gorm:"size:50;not null" json:"provider_type"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	BaseURL      string    `gorm:"size:500;not null" json:"base_url"`
	APIKey       string    `gorm:"size:500;not null" json:"-"`
	Model        string    `gorm:"size:100;not null" json:"model"`
	IsActive     bool      `gorm:"default:false" json:"is_active"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
