package model

import (
	"time"

	"gorm.io/gorm"
)

type InteractionType string

const (
	InteractionMeeting InteractionType = "meeting"
	InteractionCall    InteractionType = "call"
	InteractionMessage InteractionType = "message"
	InteractionEmail   InteractionType = "email"
	InteractionOther   InteractionType = "other"
)

type Interaction struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	UserID      uint            `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint            `gorm:"index;not null;default:0" json:"workspace_id"`
	ContactID   uint            `gorm:"index;not null" json:"contact_id"`
	Type       InteractionType `gorm:"size:20;not null" json:"type"`
	Title      string          `gorm:"size:200;not null" json:"title"`
	Content    string          `gorm:"type:text" json:"content"`
	OccurredAt time.Time       `gorm:"not null" json:"occurred_at"`
	CreatedAt  time.Time       `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt  time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt  gorm.DeletedAt  `gorm:"index" json:"-"`
}
