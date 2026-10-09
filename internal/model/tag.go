package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

var ErrInvalidTagIDs = errors.New("tags must exist in the same workspace")

type Tag struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID      string    `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID string    `gorm:"size:36;uniqueIndex:idx_ws_tag;not null;default:0" json:"workspace_id"`
	Name        string    `gorm:"size:36;uniqueIndex:idx_ws_tag;size:50;not null" json:"name"`
	Color       string    `gorm:"size:7" json:"color"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (t *Tag) BeforeCreate(tx *gorm.DB) error { return ensureID(&t.ID, tx) }
