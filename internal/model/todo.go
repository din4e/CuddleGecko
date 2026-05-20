package model

import (
	"time"

	"gorm.io/gorm"
)

type Todo struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Description string         `gorm:"type:text" json:"description"`
	Status      string         `gorm:"size:20;not null;default:'pending'" json:"status"`   // pending / done
	Priority    string         `gorm:"size:20;not null;default:'normal'" json:"priority"` // low / normal / high
	DueTime     *time.Time     `json:"due_time"`
	Amount      *float64       `json:"amount"`
	AmountType  string         `gorm:"size:20" json:"amount_type"` // "" / income / expense
	ContactIDs  []uint         `gorm:"type:text;serializer:json" json:"contact_ids"`
	Color       string         `gorm:"size:20" json:"color"`
	CompletedAt *time.Time     `json:"completed_at"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
