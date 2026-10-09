package model

import (
	"time"

	"gorm.io/gorm"
)

// Tag target types — the entity a tag is attached to.
const (
	TagTargetContact     = "contact"
	TagTargetTodo        = "todo"
	TagTargetEvent       = "event"
	TagTargetTransaction = "transaction"
	TagTargetWorkout     = "workout"
	TagTargetHabit       = "habit"
	TagTargetReminder    = "reminder"
)

// Tagging is a polymorphic association between a Tag and any taggable entity
// (contact, todo, ...). Replaces the old contact-only contact_tags join so a
// single mechanism serves every entity type.
type Tagging struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	WorkspaceID string    `gorm:"size:36;index;not null;default:0;uniqueIndex:idx_tagging_uniq;index:idx_taggings_workspace_target,priority:1" json:"workspace_id"`
	TagID       string    `gorm:"size:36;not null;uniqueIndex:idx_tagging_uniq;index;index:idx_taggings_workspace_target,priority:4" json:"tag_id"`
	TargetType  string    `gorm:"size:20;not null;uniqueIndex:idx_tagging_uniq;index:idx_taggings_workspace_target,priority:2" json:"target_type"`
	TargetID    string    `gorm:"size:36;not null;uniqueIndex:idx_tagging_uniq;index;index:idx_taggings_workspace_target,priority:3" json:"target_id"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Tagging) TableName() string { return "taggings" }

// BeforeCreate assigns the UUID primary key on first insert.
func (t *Tagging) BeforeCreate(tx *gorm.DB) error { return ensureID(&t.ID, tx) }
