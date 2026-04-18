package model

import (
	"time"

	"gorm.io/gorm"
)

type Contact struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	UserID            uint           `gorm:"index;not null" json:"user_id"`
	Name              string         `gorm:"size:100;not null" json:"name"`
	Nickname          string         `gorm:"size:100" json:"nickname"`
	AvatarEmoji       string         `gorm:"size:10" json:"avatar_emoji"`
	AvatarURL         string         `gorm:"size:500" json:"avatar_url"`
	Phone             string         `gorm:"size:50" json:"phone"`
	Email             string         `gorm:"size:100" json:"email"`
	Birthday          *time.Time     `json:"birthday"`
	Notes             string         `gorm:"type:text" json:"notes"`
	RelationshipLabels []string      `gorm:"type:text;serializer:json" json:"relationship_labels"`
	Tags              []Tag          `gorm:"many2many:contact_tags" json:"tags"`
	CreatedAt         time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}
