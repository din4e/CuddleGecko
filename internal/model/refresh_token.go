package model

import (
	"time"

	"gorm.io/gorm"
)

type RefreshToken struct {
	ID        string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID    string    `gorm:"size:36;index;not null" json:"user_id"`
	Token     string    `gorm:"size:36;uniqueIndex;size:255;not null" json:"token"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
	// RevokedAt records when the CAS revoke happened; the replay check uses it
	// to tell a benign concurrent refresh (rotated seconds ago) from a late
	// replay of a long-dead token (likely theft).
	RevokedAt *time.Time `json:"revoked_at"`
	CreatedAt time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (r *RefreshToken) BeforeCreate(tx *gorm.DB) error { return ensureID(&r.ID, tx) }
