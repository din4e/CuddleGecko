package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

// TodoActivityRepository persists the per-todo audit log.
type TodoActivityRepository interface {
	CreateBatch(ctx context.Context, activities []model.TodoActivity) error
	List(ctx context.Context, todoID uint, limit int) ([]model.TodoActivity, error)
}

// TodoUserLookup resolves the actor's username for the activity log. Satisfied
// by repository.UserRepo.
type TodoUserLookup interface {
	GetUserByID(ctx context.Context, id uint) (*model.User, error)
}

// TodoHistoryOption wires the audit-log + username resolution dependencies.
// When either is nil the service skips history recording entirely (tests,
// MCP tools under test, deployments that don't want the log).

// WithTodoHistory enables per-todo activity recording and username resolution.
// Passing nil for a dependency skips just that part.
func WithTodoHistory(activities TodoActivityRepository, users TodoUserLookup) TodoServiceOption {
	return func(s *TodoService) {
		if activities != nil {
			s.activityRepo = activities
		}
		if users != nil {
			s.userLookup = users
		}
	}
}

// usernameCache memoizes userID → username. History lines are immutable and
// usernames effectively unique per id, so the cache never needs invalidation.
type usernameCache struct {
	mu   sync.RWMutex
	name map[uint]string
}

func (c *usernameCache) get(id uint) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	name, ok := c.name[id]
	return name, ok
}

func (c *usernameCache) put(id uint, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.name == nil {
		c.name = make(map[uint]string)
	}
	c.name[id] = name
}

// resolveUsername maps a userID to a display name, tolerating lookup failures
// (deleted user) by falling back to the numeric id rendered as a string.
func (s *TodoService) resolveUsername(ctx context.Context, userID uint) string {
	if s.userLookup == nil {
		return fmt.Sprintf("user#%d", userID)
	}
	if name, ok := s.usernames.get(userID); ok {
		return name
	}
	user, err := s.userLookup.GetUserByID(ctx, userID)
	name := fmt.Sprintf("user#%d", userID)
	if err == nil && user != nil && user.Username != "" {
		name = user.Username
	}
	s.usernames.put(userID, name)
	return name
}

// recordActivity appends audit lines for a todo mutation. Best-effort: history
// failures never fail the mutation that produced them.
func (s *TodoService) recordActivity(ctx context.Context, userID, todoID uint, entries []model.TodoActivity) {
	if s.activityRepo == nil || len(entries) == 0 {
		return
	}
	username := s.resolveUsername(ctx, userID)
	for i := range entries {
		entries[i].TodoID = todoID
		entries[i].UserID = userID
		entries[i].Username = username
	}
	// Errors are intentionally swallowed: the log must not break the write path.
	_ = s.activityRepo.CreateBatch(ctx, entries)
}

// activityEntry builds one activity line with the actor already set.
func activityEntry(action, field, oldValue, newValue string) model.TodoActivity {
	return model.TodoActivity{Action: action, Field: field, OldValue: model.TruncateActivityValue(oldValue), NewValue: model.TruncateActivityValue(newValue)}
}

// formatActivityTime renders a timestamp for the activity log in a compact,
// timezone-stable local format.
func formatActivityTime(t time.Time) string {
	return t.Local().Format("2006-01-02 15:04")
}

// diffTodoUpdates compares the persisted todo against the incoming update and
// returns one activity line per changed field. Status changes map to the more
// readable completed/reopened actions instead of a generic "updated".
func diffTodoUpdates(before, after *model.Todo) []model.TodoActivity {
	var entries []model.TodoActivity
	add := func(field, oldValue, newValue string) {
		entries = append(entries, activityEntry(model.TodoActivityUpdated, field, oldValue, newValue))
	}
	if before.Title != after.Title {
		add("title", before.Title, after.Title)
	}
	if before.Description != after.Description {
		add("description", before.Description, after.Description)
	}
	if before.Priority != after.Priority {
		add("priority", before.Priority, after.Priority)
	}
	if before.Repeat != after.Repeat {
		add("repeat", before.Repeat, after.Repeat)
	}
	if !timePtrEqual(before.DueTime, after.DueTime) {
		add("due_time", timePtrString(before.DueTime), timePtrString(after.DueTime))
	}
	if !timePtrEqual(before.StartTime, after.StartTime) {
		add("start_time", timePtrString(before.StartTime), timePtrString(after.StartTime))
	}
	if !amountEqual(before.Amount, after.Amount) {
		add("amount", amountPtrString(before.Amount), amountPtrString(after.Amount))
	}
	if before.Status != after.Status {
		action := model.TodoActivityUpdated
		if after.Status == "done" {
			action = model.TodoActivityCompleted
		} else if before.Status == "done" && after.Status == "pending" {
			action = model.TodoActivityReopened
		}
		entries = append(entries, activityEntry(action, "status", before.Status, after.Status))
	}
	return entries
}

func timePtrEqual(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equal(*b)
}

func timePtrString(t *time.Time) string {
	if t == nil {
		return ""
	}
	return formatActivityTime(*t)
}

func amountEqual(a, b *float64) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func amountPtrString(a *float64) string {
	if a == nil {
		return ""
	}
	return fmt.Sprintf("%g", *a)
}

func uintPtrEqual(a, b *uint) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func uintPtrString(u *uint) string {
	if u == nil {
		return ""
	}
	return fmt.Sprintf("%d", *u)
}

// ListActivities returns the todo's audit log, newest first.
func (s *TodoService) ListActivities(ctx context.Context, userID, workspaceID, todoID uint, limit int) ([]model.TodoActivity, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	if s.activityRepo == nil {
		return []model.TodoActivity{}, nil
	}
	return s.activityRepo.List(ctx, todoID, limit)
}
