package model

import "time"

type ContactRelation struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	WorkspaceID  uint      `gorm:"index;not null;default:0;index:idx_relation_a;index:idx_relation_b" json:"workspace_id"`
	ContactIDA   uint      `gorm:"index;not null;index:idx_relation_a" json:"contact_id_a"`
	ContactIDB   uint      `gorm:"index;not null;index:idx_relation_b" json:"contact_id_b"`
	RelationType string    `gorm:"size:50" json:"relation_type"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
}
