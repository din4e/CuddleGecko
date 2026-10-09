package model

import (
	"time"

	"gorm.io/gorm"
)

type ContactRelation struct {
	ID           string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID       string    `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID  string    `gorm:"size:36;index;not null;default:0;index:idx_relation_a;index:idx_relation_b" json:"workspace_id"`
	ContactIDA   string    `gorm:"size:36;index;not null;index:idx_relation_a" json:"contact_id_a"`
	ContactIDB   string    `gorm:"size:36;index;not null;index:idx_relation_b" json:"contact_id_b"`
	RelationType string    `gorm:"size:50" json:"relation_type"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (c *ContactRelation) BeforeCreate(tx *gorm.DB) error { return ensureID(&c.ID, tx) }
