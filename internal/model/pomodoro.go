package model

import "time"

// PomodoroSession records one completed (or stopped) focus/break block
// (滴答清单的"番茄专注").
type PomodoroSession struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"index;not null" json:"user_id"`
	WorkspaceID     uint      `gorm:"index;not null;default:0" json:"workspace_id"`
	TodoID          *uint     `gorm:"index" json:"todo_id"`
	DurationSeconds int       `gorm:"not null" json:"duration_seconds"`
	Kind            string    `gorm:"size:10;not null;default:'focus'" json:"kind"` // focus | break
	Completed       bool      `gorm:"default:true" json:"completed"`
	StartedAt       time.Time `gorm:"not null" json:"started_at"`
	EndedAt         time.Time `gorm:"not null" json:"ended_at"`
	CreatedAt       time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// PomodoroSummary aggregates focus-session stats (today + all-time).
type PomodoroSummary struct {
	TodayCount   int64 `json:"today_count"`
	TodaySeconds int64 `json:"today_seconds"`
	TotalCount   int64 `json:"total_count"`
	TotalSeconds int64 `json:"total_seconds"`
}
