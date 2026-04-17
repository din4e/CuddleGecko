package model

import (
	"time"

	"gorm.io/gorm"
)

type RelationshipType string

const (
	RelationshipFamily    RelationshipType = "family"
	RelationshipFriend    RelationshipType = "friend"
	RelationshipColleague RelationshipType = "colleague"
	RelationshipClient    RelationshipType = "client"
	RelationshipOther     RelationshipType = "other"
)

type Contact struct {
	ID               uint             `gorm:"primaryKey" json:"id"`
	UserID           uint             `gorm:"index;not null" json:"user_id"`
	Name             string           `gorm:"size:100;not null" json:"name"`
	Nickname         string           `gorm:"size:100" json:"nickname"`
	AvatarURL        string           `gorm:"size:500" json:"avatar_url"`
	Phone            string           `gorm:"size:50" json:"phone"`
	Email            string           `gorm:"size:100" json:"email"`
	Birthday         *time.Time       `json:"birthday"`
	Notes            string           `gorm:"type:text" json:"notes"`
	RelationshipType RelationshipType `gorm:"size:20;default:'other'" json:"relationship_type"`
	Tags             []Tag            `gorm:"many2many:contact_tags" json:"tags"`
	CreatedAt        time.Time        `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time        `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt        gorm.DeletedAt   `gorm:"index" json:"-"`
}
