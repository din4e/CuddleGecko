package model

import (
	"time"

	"gorm.io/gorm"
)

// HabitLog is a single habit check-in on a calendar date (YYYY-MM-DD).
// One row per (workspace, habit, date).
type HabitLog struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID      string    `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID string    `gorm:"size:36;index;not null;default:0;uniqueIndex:idx_habit_log" json:"workspace_id"`
	HabitID     string    `gorm:"size:36;not null;uniqueIndex:idx_habit_log;index" json:"habit_id"`
	Date        string    `gorm:"size:10;not null;uniqueIndex:idx_habit_log" json:"date"` // 2006-01-02
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (h *HabitLog) BeforeCreate(tx *gorm.DB) error { return ensureID(&h.ID, tx) }
