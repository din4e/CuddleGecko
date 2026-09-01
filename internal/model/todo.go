package model

import (
	"time"

	"gorm.io/gorm"
)

type Todo struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0;index:idx_todo_ws_status_due" json:"workspace_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Description string         `gorm:"type:longtext" json:"description"`
	Status      string         `gorm:"size:20;not null;default:'pending';index:idx_todo_ws_status_due" json:"status"`   // pending / done / abandoned
	Priority    string         `gorm:"size:20;not null;default:'normal'" json:"priority"` // low / normal / high
	Pinned       bool           `gorm:"not null;default:false" json:"pinned"`
	DueTime     *time.Time     `gorm:"index:idx_todo_ws_status_due" json:"due_time"`
	StartTime   *time.Time     `json:"start_time"`
	Amount      *float64       `json:"amount"`
	AmountType  string         `gorm:"size:20" json:"amount_type"` // "" / income / expense
	ContactIDs  []uint         `gorm:"type:longtext;serializer:json" json:"contact_ids"`
	Tags        []Tag          `gorm:"many2many:todo_tags" json:"tags"`
	Color       string         `gorm:"size:20" json:"color"`
	Repeat      string         `gorm:"size:20" json:"repeat"` // ""/daily/weekly/weekdays/monthly/yearly
	RepeatInterval int         `gorm:"not null;default:1" json:"repeat_interval"`
	SortOrder   int            `gorm:"not null;default:0" json:"sort_order"`
	ParentID    *uint          `gorm:"index" json:"parent_id"`
	CompletedAt *time.Time     `json:"completed_at"`
	// Denormalized checklist progress, kept in sync with TodoItem changes so
	// list views can render progress badges without extra queries.
	ItemTotal  int            `gorm:"not null;default:0" json:"item_total"`
	ItemDone   int            `gorm:"not null;default:0" json:"item_done"`
	// Pomodoros completed on this todo (25-min focus sessions).
	PomodoroCount int         `gorm:"not null;default:0" json:"pomodoro_count"`
	// Live count of direct children (computed subquery, read-only — never a
	// stored column). Lets the lazy tree show the expand caret before the
	// children have been fetched.
	ChildCount  int64          `gorm:"->" json:"child_count"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TodoItem is a single checklist/subtask line belonging to a Todo.
type TodoItem struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	TodoID    uint           `gorm:"index;not null" json:"todo_id"`
	Content   string         `gorm:"size:500;not null" json:"content"`
	Done      bool           `gorm:"not null;default:false" json:"done"`
	DueTime   *time.Time     `json:"due_time"`
	SortOrder int            `gorm:"not null;default:0" json:"sort_order"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// TodoActivity is one immutable audit-log line for a Todo: which user did what,
// when. Action is a short verb (created/updated/deleted/...); for field edits
// Field carries the changed column with Old/New values (truncated).
type TodoActivity struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TodoID    uint      `gorm:"index;not null" json:"todo_id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	Username  string    `gorm:"size:50;not null" json:"username"`
	Action    string    `gorm:"size:30;not null" json:"action"`
	Field     string    `gorm:"size:30" json:"field"`
	OldValue  string    `gorm:"size:500" json:"old_value"`
	NewValue  string    `gorm:"size:500" json:"new_value"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// Todo activity action values.
const (
	TodoActivityCreated    = "created"
	TodoActivityUpdated    = "updated"
	TodoActivityCompleted  = "completed"
	TodoActivityReopened   = "reopened"
	TodoActivityPinned     = "pinned"
	TodoActivityUnpinned   = "unpinned"
	TodoActivityMoved      = "moved"
	TodoActivityDeleted    = "deleted"
	TodoActivityRestored   = "restored"
)

// TruncateActivityValue caps a recorded field value so a long description edit
// doesn't bloat the activity log row.
func TruncateActivityValue(s string) string {
	const max = 500
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

// TodoListQuery captures the filter, sort and paging options for listing todos.
// It powers the TickTick-style smart lists (Today / Next 7 days / Overdue),
// search box, and sort menu.
type TodoListQuery struct {
	Status    string     // "pending" | "done" | "abandoned" | "" (all)
	Priority  string     // "low" | "normal" | "high" | "" (all)
	Search    string     // case-insensitive substring match on title
	DueBefore *time.Time // include todos due at or before this time
	DueAfter  *time.Time // include todos due at or after this time
	Overdue   bool       // pending todos whose due_time is in the past
	Started   bool       // hide tasks whose start_time is still in the future
	Deferred  bool       // only pending todos whose start_time is still in the future
	DoneAfter *time.Time // completed_at at or after this time (done-today / done-this-week lists)
	TagIDs    []uint     // only todos tagged with any of these
	ParentID  *uint      // only direct children of this todo
	RootsOnly bool       // only top-level todos (parent_id IS NULL) — lazy tree roots
	Sort      string     // due_date (default) | priority | title | created
	Order     string     // asc (default) | desc
	Page      int
	PageSize  int
}

// Todo sort keys.
const (
	TodoSortDueDate  = "due_date"
	TodoSortPriority = "priority"
	TodoSortTitle    = "title"
	TodoSortCreated  = "created"
	TodoSortManual   = "manual"
)

// PriorityRank maps a priority string to a sortable integer (high first).
// Lower rank sorts earlier. Unknown priorities sort last.
func PriorityRank(priority string) int {
	switch priority {
	case "high":
		return 0
	case "normal":
		return 1
	case "low":
		return 2
	default:
		return 3
	}
}

// TodoStats is a productivity overview for a workspace.
type TodoStats struct {
	Total        int64 `json:"total"`
	Pending      int64 `json:"pending"`
	Overdue      int64 `json:"overdue"`
	Deferred     int64 `json:"deferred"`
	DoneToday    int64 `json:"done_today"`
	DoneThisWeek int64 `json:"done_this_week"`
}

// NextDueTime advances a due time by one occurrence of the repeat rule (scaled
// by interval, e.g. every 2 weeks), then fast-forwards past `now` so an overdue
// recurring task lands on the next future occurrence. Returns ok=false for an
// unknown/empty rule. Shared so both the service and repository stay consistent.
func NextDueTime(rule string, interval int, from, now time.Time) (time.Time, bool) {
	if interval < 1 {
		interval = 1
	}
	step := func(t time.Time) (time.Time, bool) {
		switch rule {
		case "daily":
			return t.AddDate(0, 0, interval), true
		case "weekly":
			return t.AddDate(0, 0, 7*interval), true
		case "monthly":
			return t.AddDate(0, interval, 0), true
		case "yearly":
			return t.AddDate(interval, 0, 0), true
		case "weekdays":
			// Advance `interval` weekdays, skipping weekends.
			d := t
			count := 0
			for count < interval {
				d = d.AddDate(0, 0, 1)
				if d.Weekday() != time.Saturday && d.Weekday() != time.Sunday {
					count++
				}
			}
			return d, true
		default:
			return t, false
		}
	}

	next, ok := step(from)
	if !ok {
		return from, false
	}
	for i := 0; i < 1000 && next.Before(now); i++ {
		n, ok := step(next)
		if !ok || !n.After(next) {
			break
		}
		next = n
	}
	return next, true
}
