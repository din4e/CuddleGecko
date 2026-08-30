package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTodoNotFound = errors.New("todo not found")

var (
	ErrTodoItemNotFound  = errors.New("todo item not found")
	ErrTodoItemEmpty     = errors.New("todo item content is empty")
	ErrTodoInvalidParent = errors.New("parent todo not found in this workspace")
)

// Sibling positions for Move when after_id is absent: land at the top of the
// sibling group (default) or append at the end.
const (
	TodoMoveFirst = "first"
	TodoMoveLast  = "last"
)

type TodoRepository interface {
	Create(ctx context.Context, todo *model.Todo) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error)
	List(ctx context.Context, workspaceID uint, q model.TodoListQuery) ([]model.Todo, int64, error)
	Update(ctx context.Context, todo *model.Todo) error
	Delete(ctx context.Context, workspaceID, id uint) error
	ReplaceTags(ctx context.Context, todoID uint, tags []model.Tag) error
	GetTags(ctx context.Context, todoID uint) ([]model.Tag, error)
	Stats(ctx context.Context, workspaceID uint) (model.TodoStats, error)
	Reorder(ctx context.Context, workspaceID, id uint, afterID *uint) error
	Move(ctx context.Context, workspaceID, id uint, parentID, afterID *uint, position string) error
	PromoteItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) (*model.Todo, error)
	Duplicate(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error)
	SetPinned(ctx context.Context, workspaceID, id uint, pinned bool) error
	SetParent(ctx context.Context, workspaceID, id uint, parentID *uint) error
	UpdateCreatedAt(ctx context.Context, id uint, at time.Time) error
	IncrementPomodoro(ctx context.Context, workspaceID, id uint) error
	BulkAction(ctx context.Context, workspaceID uint, ids []uint, action string) (int64, error)
	ListTrash(ctx context.Context, workspaceID uint) ([]model.Todo, error)
	Restore(ctx context.Context, workspaceID, id uint) error
}

// TodoItemRepository handles checklist (subtask) persistence for a todo.
type TodoItemRepository interface {
	ListItems(ctx context.Context, todoID uint) ([]model.TodoItem, error)
	ListItemsByTodoIDs(ctx context.Context, todoIDs []uint) ([]model.TodoItem, error)
	GetItem(ctx context.Context, todoID, itemID uint) (*model.TodoItem, error)
	CreateItem(ctx context.Context, item *model.TodoItem) error
	UpdateItem(ctx context.Context, todoID uint, item *model.TodoItem) error
	SetItemDone(ctx context.Context, todoID, itemID uint, done bool) error
	DeleteItem(ctx context.Context, todoID, itemID uint) error
	ReorderItem(ctx context.Context, todoID, itemID uint, afterItemID *uint) error
}

// TodoClear flags which nullable fields should be explicitly cleared during an
// update (patch semantics) rather than left untouched.
type TodoClear struct {
	DueTime   bool
	StartTime bool
	Amount    bool
}

type EventRepositoryForSync interface {
	Create(ctx context.Context, event *model.Event) error
}

// --- Real-time change notification (multi-device sync) ---

// TodoChangeKind classifies a todo mutation for downstream sync listeners.
type TodoChangeKind string

const (
	TodoCreated      TodoChangeKind = "created"
	TodoUpdated      TodoChangeKind = "updated"
	TodoDeleted      TodoChangeKind = "deleted"
	TodoItemsChanged TodoChangeKind = "items_changed"
	TodoBulk         TodoChangeKind = "bulk"
)

// TodoChangeNotifier receives a best-effort notification whenever a todo changes.
// The realtime hub implements this so other devices in the same workspace can
// refresh. Implementations must be safe to call from any goroutine and must not
// block the caller — the service treats notifications as fire-and-forget.
type TodoChangeNotifier interface {
	NotifyTodoChange(ctx context.Context, workspaceID, todoID uint, kind TodoChangeKind)
}

// noopTodoNotifier is the default notifier: notifications are discarded (tests,
// dev, or any deployment without a realtime hub wired in).
type noopTodoNotifier struct{}

func (noopTodoNotifier) NotifyTodoChange(context.Context, uint, uint, TodoChangeKind) {}

// TodoServiceOption configures a TodoService at construction time.
type TodoServiceOption func(*TodoService)

// WithTodoNotifier wires a real-time change notifier (e.g. the WS hub) so todo
// mutations fan out to other connected clients in the same workspace.
func WithTodoNotifier(n TodoChangeNotifier) TodoServiceOption {
	return func(s *TodoService) {
		if n != nil {
			s.notifier = n
		}
	}
}

type TodoService struct {
	repo         TodoRepository
	eventRepo    EventRepositoryForSync
	itemRepo     TodoItemRepository
	notifier     TodoChangeNotifier
	activityRepo TodoActivityRepository
	commentRepo  TodoCommentRepository
	userLookup   TodoUserLookup
	usernames    usernameCache
}

func NewTodoService(repo TodoRepository, eventRepo EventRepositoryForSync, itemRepo TodoItemRepository, opts ...TodoServiceOption) *TodoService {
	s := &TodoService{repo: repo, eventRepo: eventRepo, itemRepo: itemRepo, notifier: noopTodoNotifier{}}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// notify fires the change notification. Best-effort: it never returns an error
// and is only called after the underlying repo mutation has succeeded.
func (s *TodoService) notify(ctx context.Context, workspaceID, todoID uint, kind TodoChangeKind) {
	if s.notifier != nil {
		s.notifier.NotifyTodoChange(ctx, workspaceID, todoID, kind)
	}
}

func (s *TodoService) Create(ctx context.Context, userID, workspaceID uint, todo *model.Todo) (*model.Todo, error) {
	todo.UserID = userID
	todo.WorkspaceID = workspaceID
	if todo.Status == "" {
		todo.Status = "pending"
	}
	if err := validateTodoStatus(todo.Status); err != nil {
		return nil, err
	}
	// Only done tasks carry a completion timestamp (it powers done-today stats).
	if todo.Status == "done" && todo.CompletedAt == nil {
		now := time.Now()
		todo.CompletedAt = &now
	}
	if todo.Priority == "" {
		todo.Priority = "normal"
	}
	// A nested todo's parent must exist in the same workspace (defends against
	// dangling / cross-workspace parent ids supplied on create).
	if todo.ParentID != nil {
		if _, err := s.repo.GetByID(ctx, workspaceID, *todo.ParentID); err != nil {
			return nil, ErrTodoInvalidParent
		}
	}
	if err := s.repo.Create(ctx, todo); err != nil {
		return nil, err
	}
	s.recordActivity(ctx, userID, todo.ID, []model.TodoActivity{activityEntry(model.TodoActivityCreated, "", "", todo.Title)})
	s.notify(ctx, workspaceID, todo.ID, TodoCreated)
	return todo, nil
}

func (s *TodoService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	return s.repo.GetByID(ctx, workspaceID, id)
}

func (s *TodoService) List(ctx context.Context, userID, workspaceID uint, q model.TodoListQuery) ([]model.Todo, int64, error) {
	return s.repo.List(ctx, workspaceID, q)
}

func (s *TodoService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Todo, clear TodoClear) (*model.Todo, error) {
	if err := validateTodoStatus(updates.Status); err != nil {
		return nil, err
	}
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}
	before := *todo

	if updates.Title != "" {
		todo.Title = updates.Title
	}
	todo.Description = updates.Description
	if updates.Status != "" {
		applyStatus(todo, updates.Status)
	}
	if updates.Priority != "" {
		todo.Priority = updates.Priority
	}
	if clear.DueTime {
		todo.DueTime = nil
	} else if updates.DueTime != nil {
		todo.DueTime = updates.DueTime
	}
	if clear.StartTime {
		todo.StartTime = nil
	} else if updates.StartTime != nil {
		todo.StartTime = updates.StartTime
	}
	if clear.Amount {
		todo.Amount = nil
	} else if updates.Amount != nil {
		todo.Amount = updates.Amount
	}
	todo.AmountType = updates.AmountType
	todo.ContactIDs = updates.ContactIDs
	todo.Color = updates.Color
	todo.Repeat = updates.Repeat
	if updates.RepeatInterval > 0 {
		todo.RepeatInterval = updates.RepeatInterval
	}

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	s.recordActivity(ctx, userID, todo.ID, diffTodoUpdates(&before, todo))
	s.notify(ctx, workspaceID, todo.ID, TodoUpdated)
	return todo, nil
}

func (s *TodoService) ToggleStatus(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}
	prevStatus := todo.Status

	if todo.Status == "pending" {
		// Completing a recurring task with a due date advances it to the next
		// occurrence and keeps it pending (TickTick behaviour) instead of
		// marking it done.
		if todo.Repeat != "" && todo.DueTime != nil {
			if next, ok := model.NextDueTime(todo.Repeat, todo.RepeatInterval, *todo.DueTime, time.Now()); ok {
				todo.DueTime = &next
				todo.CompletedAt = nil
			} else {
				markDone(todo)
			}
		} else {
			markDone(todo)
		}
	} else {
		todo.Status = "pending"
		todo.CompletedAt = nil
	}

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	if todo.Status != prevStatus {
		action := model.TodoActivityReopened
		if todo.Status == "done" {
			action = model.TodoActivityCompleted
		}
		s.recordActivity(ctx, userID, todo.ID, []model.TodoActivity{activityEntry(action, "status", prevStatus, todo.Status)})
	}
	s.notify(ctx, workspaceID, todo.ID, TodoUpdated)
	return todo, nil
}

// SetStatus explicitly sets a todo's status (pending / done / abandoned) — the
// endpoint behind the edit dialog's status picker, the card's abandon action
// and kanban drops onto arbitrary status columns. Unlike ToggleStatus it never
// advances recurring tasks; the client keeps using the toggle for the
// complete-a-recurring-task flow.
func (s *TodoService) SetStatus(ctx context.Context, userID, workspaceID, id uint, status string) (*model.Todo, error) {
	if status == "" {
		return nil, fmt.Errorf("%w: status is required", ErrInvalidTodo)
	}
	if err := validateTodoStatus(status); err != nil {
		return nil, err
	}
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}
	prevStatus := todo.Status

	applyStatus(todo, status)

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	if todo.Status != prevStatus {
		action := model.TodoActivityReopened
		if todo.Status == "done" {
			action = model.TodoActivityCompleted
		}
		s.recordActivity(ctx, userID, todo.ID, []model.TodoActivity{activityEntry(action, "status", prevStatus, todo.Status)})
	}
	s.notify(ctx, workspaceID, todo.ID, TodoUpdated)
	return todo, nil
}

// applyStatus sets the status and keeps completed_at in sync: only done tasks
// carry a completion timestamp (done-today / done-this-week stats read it), and
// re-completing an already-done task keeps its original completion time.
func applyStatus(todo *model.Todo, status string) {
	todo.Status = status
	if status == "done" {
		if todo.CompletedAt == nil {
			now := time.Now()
			todo.CompletedAt = &now
		}
		return
	}
	todo.CompletedAt = nil
}

// markDone completes a todo in place.
func markDone(todo *model.Todo) {
	applyStatus(todo, "done")
}

func (s *TodoService) SyncToEvent(ctx context.Context, userID, workspaceID, id uint) (*model.Event, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}

	event := &model.Event{
		UserID:      userID,
		WorkspaceID: workspaceID,
		Title:       todo.Title,
		Description: todo.Description,
		ContactIDs:  todo.ContactIDs,
		Color:       todo.Color,
	}

	if todo.DueTime != nil {
		event.StartTime = *todo.DueTime
	} else {
		event.StartTime = time.Now()
	}

	if err := s.eventRepo.Create(ctx, event); err != nil {
		return nil, err
	}
	return event, nil
}

func (s *TodoService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	s.recordActivity(ctx, userID, id, []model.TodoActivity{activityEntry(model.TodoActivityDeleted, "", "", "")})
	s.notify(ctx, workspaceID, id, TodoDeleted)
	return nil
}

// Stats returns a productivity overview for the workspace.
func (s *TodoService) Stats(ctx context.Context, userID, workspaceID uint) (model.TodoStats, error) {
	return s.repo.Stats(ctx, workspaceID)
}

// ListTrash returns soft-deleted todos for the workspace.
func (s *TodoService) ListTrash(ctx context.Context, userID, workspaceID uint) ([]model.Todo, error) {
	return s.repo.ListTrash(ctx, workspaceID)
}

// Restore un-deletes a soft-deleted todo.
func (s *TodoService) Restore(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Restore(ctx, workspaceID, id); err != nil {
		return ErrTodoNotFound
	}
	s.recordActivity(ctx, userID, id, []model.TodoActivity{activityEntry(model.TodoActivityRestored, "", "", "")})
	s.notify(ctx, workspaceID, id, TodoUpdated)
	return nil
}

// Reorder moves a todo within the workspace's manual order, after the todo with
// the given id (or to the top when afterID is nil).
func (s *TodoService) Reorder(ctx context.Context, userID, workspaceID, id uint, afterID *uint) error {
	if err := s.ensureTodoOwned(ctx, workspaceID, id); err != nil {
		return err
	}
	if err := s.repo.Reorder(ctx, workspaceID, id, afterID); err != nil {
		return err
	}
	s.notify(ctx, workspaceID, 0, TodoBulk)
	return nil
}

// Move reparents a todo (parent_id; nil = root) and reorders it among its
// siblings. Position among the siblings: after afterID when set, else "last"
// appends at the end and ""/"first" lands at the top. Emits a workspace-wide
// refresh because the sibling ordering of both the old and new parent can shift.
func (s *TodoService) Move(ctx context.Context, userID, workspaceID, id uint, parentID, afterID *uint, position string) error {
	if position != "" && position != TodoMoveFirst && position != TodoMoveLast {
		return fmt.Errorf("%w: position must be 'first' or 'last'", ErrInvalidTodo)
	}
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return ErrTodoNotFound
	}
	prevParent := todo.ParentID
	if err := s.repo.Move(ctx, workspaceID, id, parentID, afterID, position); err != nil {
		return err
	}
	if !uintPtrEqual(prevParent, parentID) {
		s.recordActivity(ctx, userID, id, []model.TodoActivity{
			activityEntry(model.TodoActivityMoved, "parent", uintPtrString(prevParent), uintPtrString(parentID)),
		})
	}
	s.notify(ctx, workspaceID, 0, TodoBulk)
	return nil
}

// PromoteItem turns a checklist item into a standalone todo.
func (s *TodoService) PromoteItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) (*model.Todo, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	if _, err := s.itemRepo.GetItem(ctx, todoID, itemID); err != nil {
		return nil, ErrTodoItemNotFound
	}
	promoted, err := s.repo.PromoteItem(ctx, userID, workspaceID, todoID, itemID)
	if err != nil {
		return nil, err
	}
	s.notify(ctx, workspaceID, todoID, TodoItemsChanged) // parent lost an item
	s.notify(ctx, workspaceID, promoted.ID, TodoCreated)
	return promoted, nil
}

// Duplicate clones a todo into a new pending todo.
func (s *TodoService) Duplicate(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, id); err != nil {
		return nil, err
	}
	clone, err := s.repo.Duplicate(ctx, userID, workspaceID, id)
	if err != nil {
		return nil, err
	}
	s.notify(ctx, workspaceID, clone.ID, TodoCreated)
	return clone, nil
}

// BulkAction applies a complete-or-delete action to many todos at once.
func (s *TodoService) BulkAction(ctx context.Context, userID, workspaceID uint, ids []uint, action string) (int64, error) {
	affected, err := s.repo.BulkAction(ctx, workspaceID, ids, action)
	if err != nil || affected == 0 {
		return affected, err
	}
	s.notify(ctx, workspaceID, 0, TodoBulk)
	return affected, err
}

// TogglePin flips a todo's pinned (starred) state.
func (s *TodoService) TogglePin(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}
	next := !todo.Pinned
	if err := s.repo.SetPinned(ctx, workspaceID, id, next); err != nil {
		return nil, err
	}
	todo.Pinned = next
	action := model.TodoActivityUnpinned
	if next {
		action = model.TodoActivityPinned
	}
	s.recordActivity(ctx, userID, id, []model.TodoActivity{activityEntry(action, "pinned", "", "")})
	s.notify(ctx, workspaceID, id, TodoUpdated)
	return todo, nil
}

// IncrementPomodoro records one completed focus session on a todo (the client
// calls it when a 25-min Pomodoro finishes). Emits an update so other devices
// see the new count.
func (s *TodoService) IncrementPomodoro(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.ensureTodoOwned(ctx, workspaceID, id); err != nil {
		return err
	}
	if err := s.repo.IncrementPomodoro(ctx, workspaceID, id); err != nil {
		return err
	}
	s.notify(ctx, workspaceID, id, TodoUpdated)
	return nil
}

// --- Tag associations ---

func (s *TodoService) GetTags(ctx context.Context, userID, workspaceID, todoID uint) ([]model.Tag, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	return s.repo.GetTags(ctx, todoID)
}

func (s *TodoService) ReplaceTags(ctx context.Context, userID, workspaceID, todoID uint, tagIDs []uint) error {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return err
	}
	tags := make([]model.Tag, len(tagIDs))
	for i, id := range tagIDs {
		tags[i].ID = id
	}
	if err := s.repo.ReplaceTags(ctx, todoID, tags); err != nil {
		return err
	}
	s.notify(ctx, workspaceID, todoID, TodoUpdated)
	return nil
}

// --- Checklist (subtask) operations ---

// ensureTodoOwned returns ErrTodoNotFound when the todo does not belong to the
// workspace, so item endpoints inherit the same ownership scoping as the todo.
func (s *TodoService) ensureTodoOwned(ctx context.Context, workspaceID, todoID uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, todoID); err != nil {
		return ErrTodoNotFound
	}
	return nil
}

func (s *TodoService) ListItems(ctx context.Context, userID, workspaceID, todoID uint) ([]model.TodoItem, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	return s.itemRepo.ListItems(ctx, todoID)
}

func (s *TodoService) CreateItem(ctx context.Context, userID, workspaceID, todoID uint, content string) (*model.TodoItem, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, ErrTodoItemEmpty
	}
	item := &model.TodoItem{TodoID: todoID, Content: content}
	if err := s.itemRepo.CreateItem(ctx, item); err != nil {
		return nil, err
	}
	s.notify(ctx, workspaceID, todoID, TodoItemsChanged)
	return item, nil
}

func (s *TodoService) UpdateItem(ctx context.Context, userID, workspaceID, todoID, itemID uint, content string, dueTime *time.Time, clearDueTime bool) (*model.TodoItem, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, ErrTodoItemEmpty
	}
	existing, err := s.itemRepo.GetItem(ctx, todoID, itemID)
	if err != nil {
		return nil, ErrTodoItemNotFound
	}
	item := &model.TodoItem{ID: itemID, TodoID: todoID, Content: content}
	switch {
	case clearDueTime:
		item.DueTime = nil
	case dueTime != nil:
		item.DueTime = dueTime
	default:
		item.DueTime = existing.DueTime // preserve when only editing content
	}
	if err := s.itemRepo.UpdateItem(ctx, todoID, item); err != nil {
		return nil, err
	}
	s.notify(ctx, workspaceID, todoID, TodoItemsChanged)
	return item, nil
}

func (s *TodoService) ToggleItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) (*model.TodoItem, error) {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return nil, err
	}
	current, err := s.itemRepo.GetItem(ctx, todoID, itemID)
	if err != nil {
		return nil, ErrTodoItemNotFound
	}
	next := !current.Done
	if err := s.itemRepo.SetItemDone(ctx, todoID, itemID, next); err != nil {
		return nil, err
	}
	current.Done = next
	s.notify(ctx, workspaceID, todoID, TodoItemsChanged)
	return current, nil
}

func (s *TodoService) DeleteItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) error {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return err
	}
	if _, err := s.itemRepo.GetItem(ctx, todoID, itemID); err != nil {
		return ErrTodoItemNotFound
	}
	if err := s.itemRepo.DeleteItem(ctx, todoID, itemID); err != nil {
		return err
	}
	s.notify(ctx, workspaceID, todoID, TodoItemsChanged)
	return nil
}

// ReorderItem moves a checklist item within its todo's manual order.
func (s *TodoService) ReorderItem(ctx context.Context, userID, workspaceID, todoID, itemID uint, afterItemID *uint) error {
	if err := s.ensureTodoOwned(ctx, workspaceID, todoID); err != nil {
		return err
	}
	if _, err := s.itemRepo.GetItem(ctx, todoID, itemID); err != nil {
		return ErrTodoItemNotFound
	}
	if err := s.itemRepo.ReorderItem(ctx, todoID, itemID, afterItemID); err != nil {
		return err
	}
	s.notify(ctx, workspaceID, todoID, TodoItemsChanged)
	return nil
}
