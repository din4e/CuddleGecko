package model

import (
	"time"

	"gorm.io/gorm"
)

type Event struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Description string         `gorm:"type:text" json:"description"`
	StartTime   time.Time      `gorm:"not null" json:"start_time"`
	EndTime     *time.Time     `json:"end_time"`
	Location    string         `gorm:"size:200" json:"location"`
	ContactIDs  []uint         `gorm:"type:text;serializer:json" json:"contact_ids"`
	Color       string         `gorm:"size:20" json:"color"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
