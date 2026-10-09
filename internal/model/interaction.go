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
	ID          string          `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID      string          `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID string          `gorm:"size:36;index;not null;default:0;index:idx_interaction_ws_contact_occurred" json:"workspace_id"`
	ContactID   string          `gorm:"size:36;index;not null;index:idx_interaction_ws_contact_occurred" json:"contact_id"`
	Type        InteractionType `gorm:"size:20;not null" json:"type"`
	Title       string          `gorm:"size:200;not null" json:"title"`
	Content     string          `gorm:"type:longtext" json:"content"`
	OccurredAt  time.Time       `gorm:"not null;index:idx_interaction_ws_contact_occurred" json:"occurred_at"`
	CreatedAt   time.Time       `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt  `gorm:"index" json:"-"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (i *Interaction) BeforeCreate(tx *gorm.DB) error { return ensureID(&i.ID, tx) }
