package model

import (
	"time"

	"gorm.io/gorm"
)

// WorkoutStatus values for a workout's lifecycle.
const (
	WorkoutStatusPlanned    = "planned"
	WorkoutStatusInProgress = "in_progress"
	WorkoutStatusCompleted  = "completed"
	WorkoutStatusSkipped    = "skipped"
)

// Workout is a single exercise session / training plan. It owns a checklist of
// WorkoutExercise rows; denormalized ItemTotal/ItemDone mirror that progress so
// list views render a progress bar without extra queries.
type Workout struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0;index:idx_workout_ws_status_sched" json:"workspace_id"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	Type        string         `gorm:"size:20;not null;default:'other'" json:"type"`      // strength|cardio|flexibility|balance|sport|other
	Status      string         `gorm:"size:20;not null;default:'planned';index:idx_workout_ws_status_sched" json:"status"` // planned|in_progress|completed|skipped
	Intensity   string         `gorm:"size:20" json:"intensity"`                         // ""|low|medium|high
	ScheduledAt *time.Time     `gorm:"index:idx_workout_ws_status_sched" json:"scheduled_at"`
	DurationMin *int           `json:"duration_min"`
	Calories    *float64       `json:"calories"`
	Color       string         `gorm:"size:20" json:"color"`
	Location    string         `gorm:"size:200" json:"location"`
	Notes       string         `gorm:"type:longtext" json:"notes"`
	SortOrder   int            `gorm:"not null;default:0" json:"sort_order"`
	CompletedAt *time.Time     `json:"completed_at"`
	// Denormalized exercise progress, kept in sync with WorkoutExercise changes.
	ItemTotal  int            `gorm:"not null;default:0" json:"item_total"`
	ItemDone   int            `gorm:"not null;default:0" json:"item_done"`
	CreatedAt  time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt  time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

// WorkoutExercise is a single movement within a workout (sets/reps/weight/
// distance/duration). Modeled like TodoItem, with a Done flag and manual order.
type WorkoutExercise struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WorkoutID   uint           `gorm:"index;not null" json:"workout_id"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	Category    string         `gorm:"size:20" json:"category"` // ""|strength|cardio|stretch|...
	Sets        *int           `json:"sets"`
	Reps        *int           `json:"reps"`
	Weight      *float64       `json:"weight"`     // kg
	Distance    *float64       `json:"distance"`   // km (cardio)
	DurationSec *int           `json:"duration_sec"`
	RestSec     *int           `json:"rest_sec"`
	Done        bool           `gorm:"not null;default:false" json:"done"`
	SortOrder   int            `gorm:"not null;default:0" json:"sort_order"`
	Notes       string         `gorm:"size:500" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// BodyMetric is a timestamped snapshot of personal body / health measurements.
// Time-series: list ordered by RecordedAt desc; BMI is derived, never stored.
type BodyMetric struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	RecordedAt  time.Time      `gorm:"index;not null" json:"recorded_at"`
	Weight      *float64       `json:"weight"`    // kg
	Height      *float64       `json:"height"`    // cm
	BodyFat     *float64       `json:"body_fat"`  // %
	MuscleMass  *float64       `json:"muscle_mass"` // kg
	RestingHR   *int           `json:"resting_hr"`
	Systolic    *int           `json:"systolic"`  // mmHg
	Diastolic   *int           `json:"diastolic"` // mmHg
	SleepHours  *float64       `json:"sleep_hours"`
	Steps       *int           `json:"steps"`
	Energy      *int           `json:"energy"` // 1-5
	Mood        *int           `json:"mood"`   // 1-5
	Notes       string         `gorm:"size:1000" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// WorkoutListQuery captures the filter, sort and paging options for workouts.
type WorkoutListQuery struct {
	Status     string     // planned|in_progress|completed|skipped|"" (all)
	Type       string     // strength|cardio|...|"" (all)
	Search     string     // case-insensitive substring match on name
	DateAfter  *time.Time // scheduled_at >=
	DateBefore *time.Time // scheduled_at <=
	Sort       string     // scheduled (default) | created | manual
	Order      string     // asc (default) | desc
	Page       int
	PageSize   int
}

// Workout sort keys.
const (
	WorkoutSortScheduled = "scheduled"
	WorkoutSortCreated   = "created"
	WorkoutSortManual    = "manual"
)

// BodyMetricListQuery captures filter + paging options for body metrics.
type BodyMetricListQuery struct {
	DateAfter  *time.Time // recorded_at >=
	DateBefore *time.Time // recorded_at <=
	Page       int
	PageSize   int
}

// WorkoutStats is a fitness overview for a workspace.
type WorkoutStats struct {
	Total         int64   `json:"total"`
	Planned       int64   `json:"planned"`
	InProgress    int64   `json:"in_progress"`
	Completed     int64   `json:"completed"`
	Skipped       int64   `json:"skipped"`
	ThisWeek      int64   `json:"this_week"`
	TotalMinutes  int64   `json:"total_minutes"`
	TotalCalories float64 `json:"total_calories"`
	StreakWeeks   int     `json:"streak_weeks"`
}

// MetricTrend is the latest-vs-previous reading of one body metric.
type MetricTrend struct {
	Latest *float64 `json:"latest"`
	Prev   *float64 `json:"prev"`
	Trend  string   `json:"trend"` // up|down|flat|none
}

// BodyMetricSummary is an overview derived from the latest body records.
type BodyMetricSummary struct {
	Latest       *BodyMetric              `json:"latest"`
	LatestWeight *float64                 `json:"latest_weight"`
	PrevWeight   *float64                 `json:"prev_weight"`
	WeightTrend  string                   `json:"weight_trend"` // up|down|flat|none
	Count        int64                    `json:"count"`
	FirstAt      *time.Time               `json:"first_at"`
	LastAt       *time.Time               `json:"last_at"`
	// Per-metric latest/prev/trend for every tracked body metric (weight is in
	// the top-level fields for backward compatibility).
	Metrics map[string]MetricTrend `json:"metrics,omitempty"`
}

// BMI computes the body-mass index from weight (kg) and height (cm). Returns 0
// when either value is non-positive. Shared so service and frontend stay
// consistent.
func BMI(weightKg, heightCm float64) float64 {
	if weightKg <= 0 || heightCm <= 0 {
		return 0
	}
	m := heightCm / 100
	return weightKg / (m * m)
}
