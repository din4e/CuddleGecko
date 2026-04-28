package model

import (
	"time"

	"gorm.io/gorm"
)

type Transaction struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Amount      float64        `gorm:"not null" json:"amount"`
	Type        string         `gorm:"size:20;not null" json:"type"`   // income / expense
	Category    string         `gorm:"size:50" json:"category"`
	ContactIDs  []uint         `gorm:"type:text;serializer:json" json:"contact_ids"`
	Date        time.Time      `gorm:"not null" json:"date"`
	Notes       string         `gorm:"type:text" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
