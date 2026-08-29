package model

import (
	"time"

	"gorm.io/gorm"
)

type Contact struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	UserID             uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID        uint           `gorm:"index;not null;default:0;index:idx_contact_search;index:idx_contacts_workspace_created,priority:1" json:"workspace_id"`
	Name               string         `gorm:"size:100;not null;index:idx_contact_search" json:"name"`
	Nickname           string         `gorm:"size:100;index:idx_contact_search" json:"nickname"`
	AvatarEmoji        string         `gorm:"size:10" json:"avatar_emoji"`
	AvatarURL          string         `gorm:"size:500" json:"avatar_url"`
	Phone              []string       `gorm:"type:longtext;serializer:json" json:"phones"`
	Email              []string       `gorm:"type:longtext;serializer:json" json:"emails"`
	Birthday           *time.Time     `json:"birthday"`
	BirthdayCalendar   string         `gorm:"size:10;default:'solar'" json:"birthday_calendar"` // "solar" | "lunar"; when lunar, Birthday holds the lunar Y/M/D
	Notes              string         `gorm:"type:longtext" json:"notes"`
	RelationshipLabels []string       `gorm:"type:longtext;serializer:json" json:"relationship_labels"`
	Tags               []Tag          `gorm:"-" json:"tags"`
	CreatedAt          time.Time      `gorm:"autoCreateTime;index:idx_contacts_workspace_created,priority:2" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}
