package model

import "time"

type Tag struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint      `gorm:"uniqueIndex:idx_ws_tag;not null;default:0" json:"workspace_id"`
	Name        string    `gorm:"uniqueIndex:idx_ws_tag;size:50;not null" json:"name"`
	Color     string    `gorm:"size:7" json:"color"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
