package model

import "time"

// TodoItem is a checklist sub-task under a Todo (滴答清单的"子任务").
type TodoItem struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	TodoID      uint      `gorm:"index;not null" json:"todo_id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint      `gorm:"index;not null;default:0" json:"workspace_id"`
	Title       string    `gorm:"size:200;not null" json:"title"`
	Done        bool      `gorm:"default:false" json:"done"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
