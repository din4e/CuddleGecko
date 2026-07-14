package model

import "time"

// HabitLog is a single habit check-in on a calendar date (YYYY-MM-DD).
// One row per (workspace, habit, date).
type HabitLog struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint      `gorm:"index;not null;default:0;uniqueIndex:idx_habit_log" json:"workspace_id"`
	HabitID     uint      `gorm:"not null;uniqueIndex:idx_habit_log;index" json:"habit_id"`
	Date        string    `gorm:"size:10;not null;uniqueIndex:idx_habit_log" json:"date"` // 2006-01-02
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}
