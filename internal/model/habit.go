package model

import (
	"time"

	"gorm.io/gorm"
)

// Habit is a daily check-in tracker (滴答清单的"习惯打卡"). v1 supports daily
// frequency; a check-in is one HabitLog row per habit per date.
type Habit struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Name        string         `gorm:"size:100;not null" json:"name"`
	Color       string         `gorm:"size:20" json:"color"`
	Emoji       string         `gorm:"size:10" json:"emoji"`
	Frequency   string         `gorm:"size:20;default:'daily'" json:"frequency"` // daily
	Archived    bool           `gorm:"default:false" json:"archived"`
	SortOrder   int            `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Virtual (not DB) — populated by the service for API output.
	TodayDone bool     `gorm:"-" json:"today_done"`
	Streak    int      `gorm:"-" json:"streak"`
	Best      int      `gorm:"-" json:"best"`
	Rate30    float64  `gorm:"-" json:"rate_30"`
	Recent    []string `gorm:"-" json:"recent"` // checked-in dates (YYYY-MM-DD) for the heatmap window
}
