package model

import "time"

type Tag struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_user_tag;not null" json:"user_id"`
	Name      string    `gorm:"uniqueIndex:idx_user_tag;size:50;not null" json:"name"`
	Color     string    `gorm:"size:7" json:"color"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
