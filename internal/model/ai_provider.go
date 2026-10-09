package model

import (
	"time"

	"gorm.io/gorm"
)

type AIProvider struct {
	ID           string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID       string    `gorm:"size:36;index;not null;index:idx_ai_provider_active" json:"user_id"`
	ProviderType string    `gorm:"size:50;not null" json:"provider_type"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	BaseURL      string    `gorm:"size:500;not null" json:"base_url"`
	APIKey       string    `gorm:"size:500;not null" json:"-"`
	Model        string    `gorm:"size:100;not null" json:"model"`
	IsActive     bool      `gorm:"default:false;index:idx_ai_provider_active" json:"is_active"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (a *AIProvider) BeforeCreate(tx *gorm.DB) error { return ensureID(&a.ID, tx) }
