package model

import (
	"time"

	"gorm.io/gorm"
)

type Event struct {
	ID          string     `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID      string     `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID string     `gorm:"size:36;index;not null;default:0;index:idx_event_ws_start" json:"workspace_id"`
	Title       string     `gorm:"size:200;not null" json:"title"`
	Description string     `gorm:"type:longtext" json:"description"`
	StartTime   time.Time  `gorm:"not null;index;index:idx_event_ws_start" json:"start_time"`
	EndTime     *time.Time `json:"end_time"`
	Location    string     `gorm:"size:200" json:"location"`
	ContactIDs  []string   `gorm:"type:longtext;serializer:json" json:"contact_ids"`
	Color       string     `gorm:"size:20" json:"color"`
	// Virtual (not DB) — populated from the polymorphic taggings table.
	Tags      []Tag          `gorm:"-" json:"tags"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (e *Event) BeforeCreate(tx *gorm.DB) error { return ensureID(&e.ID, tx) }
