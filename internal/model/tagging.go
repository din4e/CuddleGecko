package model

import "time"

// Tag target types — the entity a tag is attached to.
const (
	TagTargetContact = "contact"
	TagTargetTodo    = "todo"
)

// Tagging is a polymorphic association between a Tag and any taggable entity
// (contact, todo, ...). Replaces the old contact-only contact_tags join so a
// single mechanism serves every entity type.
type Tagging struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkspaceID uint      `gorm:"index;not null;default:0;uniqueIndex:idx_tagging_uniq;index:idx_taggings_workspace_target,priority:1" json:"workspace_id"`
	TagID       uint      `gorm:"not null;uniqueIndex:idx_tagging_uniq;index;index:idx_taggings_workspace_target,priority:4" json:"tag_id"`
	TargetType  string    `gorm:"size:20;not null;uniqueIndex:idx_tagging_uniq;index:idx_taggings_workspace_target,priority:2" json:"target_type"`
	TargetID    uint      `gorm:"not null;uniqueIndex:idx_tagging_uniq;index;index:idx_taggings_workspace_target,priority:3" json:"target_id"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Tagging) TableName() string { return "taggings" }
