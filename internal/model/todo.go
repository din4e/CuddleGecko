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
	Description string         `gorm:"type:longtext" json:"description"`
	Status      string         `gorm:"size:20;not null;default:'pending'" json:"status"`   // pending / done
	Priority    string         `gorm:"size:20;not null;default:'normal'" json:"priority"` // low / normal / high
	DueTime     *time.Time     `json:"due_time"`
	Amount      *float64       `json:"amount"`
	AmountType  string         `gorm:"size:20" json:"amount_type"` // "" / income / expense
	ContactIDs  []uint         `gorm:"type:longtext;serializer:json" json:"contact_ids"`
	Color       string         `gorm:"size:20" json:"color"`
	// List this todo belongs to; nil = Inbox.
	ListID *uint `gorm:"index" json:"list_id"`
	// Recurrence: empty = one-off. daily/weekly/monthly/yearly/weekdays.
	RepeatRule  string     `gorm:"size:20" json:"repeat_rule"`
	RepeatEvery int        `gorm:"default:1" json:"repeat_every"`
	RepeatUntil *time.Time `json:"repeat_until"`
	// Notified tracks whether the current due occurrence has already fired a
	// reminder (idempotency flag, reset when a recurring todo rolls forward).
	Notified    bool           `gorm:"default:false" json:"-"`
	CompletedAt *time.Time     `json:"completed_at"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Virtual (not DB columns) — populated by the service layer for API output.
	Tags  []Tag      `gorm:"-" json:"tags"`
	Items []TodoItem `gorm:"-" json:"items"`
}
