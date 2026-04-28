package model

import (
	"time"

	"gorm.io/gorm"
)

type Workspace struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:100;not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	Icon        string         `gorm:"size:50" json:"icon"`
	OwnerID     uint           `gorm:"index;not null" json:"owner_id"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type WorkspaceMember struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkspaceID uint      `gorm:"uniqueIndex:idx_ws_user;not null" json:"workspace_id"`
	UserID      uint      `gorm:"uniqueIndex:idx_ws_user;index;not null" json:"user_id"`
	Role        string    `gorm:"size:20;not null;default:'owner'" json:"role"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
