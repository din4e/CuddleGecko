package model

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           string    `gorm:"primaryKey;type:char(36)" json:"id"`
	Username     string    `gorm:"size:36;uniqueIndex;size:50;not null" json:"username"`
	Email        string    `gorm:"size:36;uniqueIndex;size:100;not null" json:"email"`
	PasswordHash string    `gorm:"column:password_hash;size:255;not null" json:"-"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (u *User) BeforeCreate(tx *gorm.DB) error { return ensureID(&u.ID, tx) }
