package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

// TodoActivityRepository persists the per-todo audit log.
type TodoActivityRepository interface {
	CreateBatch(ctx context.Context, activities []model.TodoActivity) error
	List(ctx context.Context, todoID string, limit int) ([]model.TodoActivity, error)
}

// TodoUserLookup resolves the actor's username for the activity log. Satisfied
// by repository.UserRepo.
type TodoUserLookup interface {
	GetUserByID(ctx context.Context, id string) (*model.User, error)
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
	name map[string]string
}

func (c *usernameCache) get(id string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	name, ok := c.name[id]
	return name, ok
}

func (c *usernameCache) put(id string, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.name == nil {
		c.name = make(map[string]string)
	}
	c.name[id] = name
}

// resolveUsername maps a userID to a display name, tolerating lookup failures
// (deleted user) by falling back to the numeric id rendered as a string.
func (s *TodoService) resolveUsername(ctx context.Context, userID string) string {
	if s.userLookup == nil {
		return fmt.Sprintf("user#%s", userID)
	}
	if name, ok := s.usernames.get(userID); ok {
		return name
	}
	user, err := s.userLookup.GetUserByID(ctx, userID)
	name := fmt.Sprintf("user#%s", userID)
	if err == nil && user != nil && user.Username != "" {
		name = user.Username
	}
	s.usernames.put(userID, name)
	return name
}

// recordActivity appends audit lines for a todo mutation. Best-effort: history
// failures never fail the mutation that produced them.
func (s *TodoService) recordActivity(ctx context.Context, userID, todoID string, entries []model.TodoActivity) {
	if s.activityRepo == nil || len(entries) == 0 {
		return
	}
	username := s.resolveUsername(ctx, userID)
	// Seq orders the log: unix-nano at batch start plus the row offset, so
	// batch rows stay in diff order and later batches always sort after
	// earlier ones — created_at DESC, id DESC used to rely on autoincrement
	// ids for this, which random UUIDs can't provide.
	base := time.Now().UnixNano()
	for i := range entries {
		entries[i].TodoID = todoID
		entries[i].UserID = userID
		entries[i].Username = username
		entries[i].Seq = base + int64(i)
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
	if before.Importance != after.Importance {
		add("importance", before.Importance, after.Importance)
	}
	if before.Urgency != after.Urgency {
		add("urgency", before.Urgency, after.Urgency)
	}
	if before.Repeat != after.Repeat {
		add("repeat", before.Repeat, after.Repeat)
	}
	if !uintSlicesEqual(before.TodoIDs, after.TodoIDs) {
		add("todo_ids", uintSliceString(before.TodoIDs), uintSliceString(after.TodoIDs))
	}
	if before.Duration != after.Duration {
		add("duration", strconv.Itoa(before.Duration), strconv.Itoa(after.Duration))
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

func idPtrEqual(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// uintSlicesEqual compares two id sets order-insensitively — link edits are
// replaces, and the picker may hand back the same set in a different order.
func uintSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[string]int, len(a))
	for _, id := range a {
		seen[id]++
	}
	for _, id := range b {
		seen[id]--
		if seen[id] < 0 {
			return false
		}
	}
	return true
}

func uintSliceString(ids []string) string {
	if len(ids) == 0 {
		return ""
	}
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, fmt.Sprintf("%s", id))
	}
	return strings.Join(parts, ",")
}

func idPtrString(u *string) string {
	if u == nil {
		return ""
	}
	return *u
}

// ListActivities returns the todo's audit log, newest first.
func (s *TodoService) ListActivities(ctx context.Context, userID, workspaceID, todoID string, limit int) ([]model.TodoActivity, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	if s.activityRepo == nil {
		return []model.TodoActivity{}, nil
	}
	return s.activityRepo.List(ctx, todoID, limit)
}
