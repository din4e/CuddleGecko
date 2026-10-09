package model

import (
	"time"

	"gorm.io/gorm"
)

type AIMessageRole string

const (
	AIMessageSystem    AIMessageRole = "system"
	AIMessageUser      AIMessageRole = "user"
	AIMessageAssistant AIMessageRole = "assistant"
)

type AIMessage struct {
	ID             string        `gorm:"primaryKey;type:char(36)" json:"id"`
	ConversationID string        `gorm:"size:36;index;not null;index:idx_aimessage_conv_created" json:"conversation_id"`
	Role           AIMessageRole `gorm:"size:20;not null" json:"role"`
	Content        string        `gorm:"type:longtext;not null" json:"content"`
	CreatedAt      time.Time     `gorm:"autoCreateTime;index:idx_aimessage_conv_created" json:"created_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (a *AIMessage) BeforeCreate(tx *gorm.DB) error { return ensureID(&a.ID, tx) }
