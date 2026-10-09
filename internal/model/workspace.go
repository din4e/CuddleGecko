package model

import (
	"time"

	"gorm.io/gorm"
)

type Workspace struct {
	ID          string         `gorm:"primaryKey;type:char(36)" json:"id"`
	Name        string         `gorm:"size:100;not null" json:"name"`
	Description string         `gorm:"type:longtext" json:"description"`
	Icon        string         `gorm:"size:50" json:"icon"`
	OwnerID     string         `gorm:"size:36;index;not null" json:"owner_id"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type WorkspaceMember struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	WorkspaceID string    `gorm:"size:36;uniqueIndex:idx_ws_user;not null" json:"workspace_id"`
	UserID      string    `gorm:"size:36;uniqueIndex:idx_ws_user;index;not null" json:"user_id"`
	Role        string    `gorm:"size:20;not null;default:'owner'" json:"role"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (w *Workspace) BeforeCreate(tx *gorm.DB) error       { return ensureID(&w.ID, tx) }
func (w *WorkspaceMember) BeforeCreate(tx *gorm.DB) error { return ensureID(&w.ID, tx) }
