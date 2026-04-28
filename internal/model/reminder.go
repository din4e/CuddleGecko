package model

import "time"

type ReminderStatus string

const (
	ReminderPending ReminderStatus = "pending"
	ReminderDone    ReminderStatus = "done"
	ReminderSnoozed ReminderStatus = "snoozed"
)

type Reminder struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	UserID      uint            `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint            `gorm:"index;not null;default:0" json:"workspace_id"`
	ContactID   uint            `gorm:"index;not null" json:"contact_id"`
	Title       string          `gorm:"size:200;not null" json:"title"`
	Description string          `gorm:"type:text" json:"description"`
	RemindAt    time.Time       `gorm:"not null" json:"remind_at"`
	Status      ReminderStatus  `gorm:"size:20;default:'pending'" json:"status"`
	CreatedAt   time.Time       `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
}
