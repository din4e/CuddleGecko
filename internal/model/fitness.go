package model

import (
	"time"

	"gorm.io/gorm"
)

// ExerciseLibraryItem is a reusable movement definition (name + muscle groups +
// equipment), independent of any single workout. Workout exercises reference it
// by free-text name; the library powers autocomplete and templates.
type ExerciseLibraryItem struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Name        string         `gorm:"size:200;not null;uniqueIndex:idx_exlib_ws_name" json:"name"`
	Category    string         `gorm:"size:20" json:"category"` // strength|cardio|stretch|...
	MuscleGroups []string      `gorm:"type:json" json:"muscle_groups"`
	Equipment   string         `gorm:"size:200" json:"equipment"`
	Notes       string         `gorm:"size:1000" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index;uniqueIndex:idx_exlib_ws_name" json:"-"`
}

// WorkoutTemplate is a reusable routine ("Push Day"): a named list of planned
// movements that can be instantiated into a planned Workout in one call.
type WorkoutTemplate struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	Type        string         `gorm:"size:20;not null;default:'other'" json:"type"`
	Notes       string         `gorm:"size:1000" json:"notes"`
	// Items is loaded eagerly by the repository, never a GORM association.
	Items       []WorkoutTemplateItem `gorm:"-" json:"items"`
	CreatedAt   time.Time             `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time             `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt        `gorm:"index" json:"-"`
}

// WorkoutTemplateItem is one movement inside a template, mirroring the fields
// of WorkoutExercise so instantiation is a straight copy.
type WorkoutTemplateItem struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	TemplateID  uint           `gorm:"index;not null" json:"template_id"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	Category    string         `gorm:"size:20" json:"category"`
	Sets        *int           `json:"sets"`
	Reps        *int           `json:"reps"`
	Weight      *float64       `json:"weight"`
	Distance    *float64       `json:"distance"`
	DurationSec *int           `json:"duration_sec"`
	RestSec     *int           `json:"rest_sec"`
	SortOrder   int            `gorm:"not null;default:0" json:"sort_order"`
	Notes       string         `gorm:"size:500" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// WorkoutSetLog is a single logged set within a workout exercise (group #
// within the movement). Unlike the planned Sets/Reps columns on
// WorkoutExercise, each row records what was actually performed, which is what
// volume and PRs are computed from.
type WorkoutSetLog struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WorkoutID   uint           `gorm:"index;not null" json:"workout_id"`
	ExerciseID  uint           `gorm:"index;not null" json:"exercise_id"`
	SetIndex    int            `gorm:"not null;default:0" json:"set_index"`
	Reps        *int           `json:"reps"`
	Weight      *float64       `json:"weight"`   // kg
	Distance    *float64       `json:"distance"` // km
	DurationSec *int           `json:"duration_sec"`
	Done        bool           `gorm:"not null;default:false" json:"done"`
	Notes       string         `gorm:"size:500" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// FitnessGoal types.
const (
	FitnessGoalWeeklyWorkouts = "weekly_workouts"
	FitnessGoalWeightTarget   = "weight_target"
)

// FitnessGoal is a user-set target: a weekly completed-workout count or a
// target weight. Current progress is computed on read, never stored.
type FitnessGoal struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Type        string         `gorm:"size:30;not null" json:"type"` // weekly_workouts|weight_target
	TargetValue float64        `gorm:"not null" json:"target_value"`
	Deadline    *time.Time     `json:"deadline"`
	Status      string         `gorm:"size:20;not null;default:'active'" json:"status"` // active|done
	Notes       string         `gorm:"size:500" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// FitnessGoalWithProgress is a goal plus its computed current value.
type FitnessGoalWithProgress struct {
	FitnessGoal
	CurrentValue *float64 `json:"current_value"` // null when no data yet
}

// WorkoutHistoryBucket aggregates completed workouts per week/month.
type WorkoutHistoryBucket struct {
	Bucket   string  `json:"bucket"` // "2026-W33" (week) | "2026-08" (month)
	Count    int64   `json:"count"`
	Minutes  int64   `json:"minutes"`
	Calories float64 `json:"calories"`
}

// ExercisePR is the personal record for one movement, derived from set logs.
type ExercisePR struct {
	Exercise  string     `json:"exercise"`
	BestWeight float64   `json:"best_weight"`
	BestE1RM  float64    `json:"best_e1rm"` // Epley estimated 1RM
	BestSetAt *time.Time `json:"best_set_at"`
}
