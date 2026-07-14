package model

import "time"

// TodoList is a container that groups todos (滴答清单的"清单/项目"). A todo
// belongs to at most one list; nil list = the default "Inbox".
type TodoList struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint      `gorm:"index;not null;default:0" json:"workspace_id"`
	Name        string    `gorm:"size:100;not null" json:"name"`
	Color       string    `gorm:"size:20" json:"color"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
