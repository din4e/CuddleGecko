package model

import (
	"time"

	"gorm.io/gorm"
)

type ReminderStatus string

const (
	ReminderPending ReminderStatus = "pending"
	ReminderDone    ReminderStatus = "done"
	ReminderSnoozed ReminderStatus = "snoozed"
)

type Reminder struct {
	ID          string         `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID      string         `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID string         `gorm:"size:36;index;not null;default:0;index:idx_reminder_ws_remind;index:idx_reminder_ws_status_remind,priority:1;index:idx_reminder_ws_contact_remind" json:"workspace_id"`
	ContactID   string         `gorm:"size:36;index;not null;index:idx_reminder_ws_contact_remind" json:"contact_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Description string         `gorm:"type:longtext" json:"description"`
	RemindAt    time.Time      `gorm:"not null;index:idx_reminder_ws_remind;index:idx_reminder_ws_status_remind,priority:3;index:idx_reminder_ws_contact_remind" json:"remind_at"`
	Status      ReminderStatus `gorm:"size:20;default:'pending';index:idx_reminder_ws_status_remind,priority:2" json:"status"`
	// Virtual (not DB) — populated from the polymorphic taggings table.
	Tags      []Tag     `gorm:"-" json:"tags"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (r *Reminder) BeforeCreate(tx *gorm.DB) error { return ensureID(&r.ID, tx) }
