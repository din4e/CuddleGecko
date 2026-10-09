package model

import (
	"time"

	"gorm.io/gorm"
)

type AIConversation struct {
	ID        string         `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID    string         `gorm:"size:36;index;not null;index:idx_ai_conversations_user_updated,priority:1" json:"user_id"`
	Title     string         `gorm:"size:200" json:"title"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime;index:idx_ai_conversations_user_updated,priority:2" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Messages  []AIMessage    `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (a *AIConversation) BeforeCreate(tx *gorm.DB) error { return ensureID(&a.ID, tx) }
