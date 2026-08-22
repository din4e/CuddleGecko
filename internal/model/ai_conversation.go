package model

import (
	"time"

	"gorm.io/gorm"
)

type AIConversation struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null;index:idx_ai_conversations_user_updated,priority:1" json:"user_id"`
	Title     string         `gorm:"size:200" json:"title"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime;index:idx_ai_conversations_user_updated,priority:2" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Messages  []AIMessage    `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}
