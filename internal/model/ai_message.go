package model

import "time"

type AIMessageRole string

const (
	AIMessageSystem    AIMessageRole = "system"
	AIMessageUser      AIMessageRole = "user"
	AIMessageAssistant AIMessageRole = "assistant"
)

type AIMessage struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	ConversationID uint          `gorm:"index;not null" json:"conversation_id"`
	Role           AIMessageRole `gorm:"size:20;not null" json:"role"`
	Content        string        `gorm:"type:text;not null" json:"content"`
	CreatedAt      time.Time     `gorm:"autoCreateTime" json:"created_at"`
}
