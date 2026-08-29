package model

import "time"

type RefreshToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	Token     string    `gorm:"uniqueIndex;size:255;not null" json:"token"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
	// RevokedAt records when the CAS revoke happened; the replay check uses it
	// to tell a benign concurrent refresh (rotated seconds ago) from a late
	// replay of a long-dead token (likely theft).
	RevokedAt *time.Time `json:"revoked_at"`
	CreatedAt time.Time  `gorm:"autoCreateTime" json:"created_at"`
}
