package model

import (
	"time"

	"gorm.io/gorm"
)

// PomodoroSession records one completed (or stopped) focus/break block
// (滴答清单的"番茄专注").
type PomodoroSession struct {
	ID              string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID          string    `gorm:"size:36;index;not null" json:"user_id"`
	WorkspaceID     string    `gorm:"size:36;index;not null;default:0;index:idx_pomodoros_workspace_started,priority:1;index:idx_pomodoros_workspace_kind_started,priority:1" json:"workspace_id"`
	TodoID          *string   `gorm:"size:36;index" json:"todo_id"`
	DurationSeconds int       `gorm:"not null" json:"duration_seconds"`
	Kind            string    `gorm:"size:10;not null;default:'focus';index:idx_pomodoros_workspace_kind_started,priority:2" json:"kind"` // focus | break
	Completed       bool      `gorm:"default:true" json:"completed"`
	StartedAt       time.Time `gorm:"not null;index:idx_pomodoros_workspace_started,priority:2;index:idx_pomodoros_workspace_kind_started,priority:3" json:"started_at"`
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

// BeforeCreate assigns the UUID primary key on first insert.
func (p *PomodoroSession) BeforeCreate(tx *gorm.DB) error { return ensureID(&p.ID, tx) }
