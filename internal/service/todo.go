package service

import (
	"context"
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTodoNotFound = errors.New("todo not found")

type TodoRepository interface {
	Create(ctx context.Context, todo *model.Todo) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error)
	List(ctx context.Context, workspaceID uint, status *string, listID *uint, overdue bool, idFilter []uint, page, pageSize int) ([]model.Todo, int64, error)
	Update(ctx context.Context, todo *model.Todo) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type TodoItemRepository interface {
	Create(ctx context.Context, item *model.TodoItem) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.TodoItem, error)
	ListByTodo(ctx context.Context, workspaceID, todoID uint) ([]model.TodoItem, error)
	ListByTodos(ctx context.Context, workspaceID uint, todoIDs []uint) (map[uint][]model.TodoItem, error)
	Update(ctx context.Context, item *model.TodoItem) error
	Delete(ctx context.Context, workspaceID, id uint) error
	DeleteByTodo(ctx context.Context, workspaceID, todoID uint) error
}

type EventRepositoryForSync interface {
	Create(ctx context.Context, event *model.Event) error
}

type TodoService struct {
	repo        TodoRepository
	eventRepo   EventRepositoryForSync
	taggingRepo TaggingRepository
	itemRepo    TodoItemRepository
}

func NewTodoService(repo TodoRepository, eventRepo EventRepositoryForSync, taggingRepo TaggingRepository, itemRepo TodoItemRepository) *TodoService {
	return &TodoService{repo: repo, eventRepo: eventRepo, taggingRepo: taggingRepo, itemRepo: itemRepo}
}

func (s *TodoService) Create(ctx context.Context, userID, workspaceID uint, todo *model.Todo) (*model.Todo, error) {
	todo.UserID = userID
	todo.WorkspaceID = workspaceID
	todo.ID = 0
	if todo.Status == "" {
		todo.Status = "pending"
	}
	if todo.Priority == "" {
		todo.Priority = "normal"
	}
	if todo.RepeatRule != "" && todo.RepeatEvery < 1 {
		todo.RepeatEvery = 1
	}
	if err := s.repo.Create(ctx, todo); err != nil {
		return nil, err
	}
	return todo, nil
}

func (s *TodoService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}
	tags, _ := s.taggingRepo.GetTags(ctx, workspaceID, model.TagTargetTodo, id)
	todo.Tags = tags
	items, _ := s.itemRepo.ListByTodo(ctx, workspaceID, id)
	todo.Items = items
	return todo, nil
}

func (s *TodoService) List(ctx context.Context, userID, workspaceID uint, status *string, listID *uint, tagIDs []uint, overdue bool, page, pageSize int) ([]model.Todo, int64, error) {
	var idFilter []uint
	if len(tagIDs) > 0 {
		matched, err := s.taggingRepo.FilterTargetIDs(ctx, workspaceID, model.TagTargetTodo, tagIDs)
		if err != nil {
			return nil, 0, err
		}
		if len(matched) == 0 {
			return []model.Todo{}, 0, nil
		}
		idFilter = matched
	}

	todos, total, err := s.repo.List(ctx, workspaceID, status, listID, overdue, idFilter, page, pageSize)
	if err != nil {
		return nil, 0, err
	}
	s.enrich(ctx, workspaceID, todos)
	return todos, total, nil
}

func (s *TodoService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Todo) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}

	if updates.Title != "" {
		todo.Title = updates.Title
	}
	todo.Description = updates.Description
	if updates.Status != "" {
		todo.Status = updates.Status
	}
	if updates.Priority != "" {
		todo.Priority = updates.Priority
	}
	if updates.DueTime != nil {
		todo.DueTime = updates.DueTime
	}
	if updates.Amount != nil {
		todo.Amount = updates.Amount
	}
	todo.AmountType = updates.AmountType
	todo.ContactIDs = updates.ContactIDs
	todo.Color = updates.Color
	todo.ListID = updates.ListID
	todo.RepeatRule = updates.RepeatRule
	if updates.RepeatEvery > 0 {
		todo.RepeatEvery = updates.RepeatEvery
	}
	if todo.RepeatRule != "" && todo.RepeatEvery < 1 {
		todo.RepeatEvery = 1
	}
	todo.RepeatUntil = updates.RepeatUntil

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	return todo, nil
}

// ToggleStatus flips a todo's status. Completing a recurring todo also spawns
// the next occurrence (cloned with an advanced due time), matching 滴答清单.
func (s *TodoService) ToggleStatus(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	todo, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTodoNotFound
	}

	if todo.Status == "pending" {
		// Spawning the next occurrence must happen before we flip the status.
		if todo.RepeatRule != "" && todo.DueTime != nil {
			if err := s.spawnNext(ctx, todo); err != nil {
				return nil, err
			}
		}
		todo.Status = "done"
		now := time.Now()
		todo.CompletedAt = &now
	} else {
		todo.Status = "pending"
		todo.CompletedAt = nil
	}

	if err := s.repo.Update(ctx, todo); err != nil {
		return nil, err
	}
	return todo, nil
}

// spawnNext creates the next recurring occurrence unless the series has ended
// (RepeatUntil passed). The current todo is left untouched (the caller marks it
// done afterwards).
func (s *TodoService) spawnNext(ctx context.Context, todo *model.Todo) error {
	next := nextOccurrence(*todo.DueTime, todo.RepeatRule, todo.RepeatEvery)
	if next.IsZero() {
		return nil
	}
	if todo.RepeatUntil != nil && next.After(*todo.RepeatUntil) {
		return nil // series ended
	}
	clone := &model.Todo{
		UserID:      todo.UserID,
		WorkspaceID: todo.WorkspaceID,
		Title:       todo.Title,
		Description: todo.Description,
		Status:      "pending",
		Priority:    todo.Priority,
		DueTime:     &next,
		Amount:      todo.Amount,
		AmountType:  todo.AmountType,
		ContactIDs:  todo.ContactIDs,
		Color:       todo.Color,
		ListID:      todo.ListID,
		RepeatRule:  todo.RepeatRule,
		RepeatEvery: todo.RepeatEvery,
		RepeatUntil: todo.RepeatUntil,
		Notified:    false,
	}
	if err := s.repo.Create(ctx, clone); err != nil {
		return err
	}

	// Carry tags and the sub-task checklist forward to the next occurrence.
	// Sub-tasks are reset to not-done for the fresh instance (滴答清单 behaviour).
	if s.taggingRepo != nil {
		if tags, err := s.taggingRepo.GetTags(ctx, todo.WorkspaceID, model.TagTargetTodo, todo.ID); err == nil && len(tags) > 0 {
			ids := make([]uint, 0, len(tags))
			for _, tg := range tags {
				ids = append(ids, tg.ID)
			}
			_ = s.taggingRepo.SetTags(ctx, todo.WorkspaceID, model.TagTargetTodo, clone.ID, ids)
		}
	}
	if s.itemRepo != nil {
		if items, err := s.itemRepo.ListByTodo(ctx, todo.WorkspaceID, todo.ID); err == nil {
			for i := range items {
				_ = s.itemRepo.Create(ctx, &model.TodoItem{
					UserID:      clone.UserID,
					WorkspaceID: clone.WorkspaceID,
					TodoID:      clone.ID,
					Title:       items[i].Title,
					Done:        false,
					SortOrder:   items[i].SortOrder,
				})
			}
		}
	}
	return nil
}

// nextOccurrence advances a time by one recurrence step. Returns the zero time
// for unknown / empty rules (meaning: do not recur).
func nextOccurrence(t time.Time, rule string, every int) time.Time {
	if every < 1 {
		every = 1
	}
	switch rule {
	case "daily":
		return t.AddDate(0, 0, every)
	case "weekly":
		return t.AddDate(0, 0, 7*every)
	case "monthly":
		return t.AddDate(0, every, 0)
	case "yearly":
		return t.AddDate(every, 0, 0)
	case "weekdays":
		next := t.AddDate(0, 0, 1)
		for i := 0; i < 14; i++ { // guard against infinite loop
			if wd := next.Weekday(); wd != time.Saturday && wd != time.Sunday {
				return next
			}
			next = next.AddDate(0, 0, 1)
		}
		return next
	default:
		return time.Time{}
	}
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
	// Clean up sub-tasks and tag associations.
	_ = s.itemRepo.DeleteByTodo(ctx, workspaceID, id)
	_ = s.taggingRepo.RemoveAll(ctx, workspaceID, model.TagTargetTodo, id)
	return nil
}

// SetTags replaces the tags on a todo.
func (s *TodoService) SetTags(ctx context.Context, userID, workspaceID, todoID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, todoID); err != nil {
		return ErrTodoNotFound
	}
	return s.taggingRepo.SetTags(ctx, workspaceID, model.TagTargetTodo, todoID, tagIDs)
}

// GetTags returns the tags on a todo.
func (s *TodoService) GetTags(ctx context.Context, userID, workspaceID, todoID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, workspaceID, todoID); err != nil {
		return nil, ErrTodoNotFound
	}
	return s.taggingRepo.GetTags(ctx, workspaceID, model.TagTargetTodo, todoID)
}

// enrich populates the virtual Tags and Items fields for a batch of todos.
func (s *TodoService) enrich(ctx context.Context, workspaceID uint, todos []model.Todo) {
	if len(todos) == 0 {
		return
	}
	ids := make([]uint, len(todos))
	for i := range todos {
		ids[i] = todos[i].ID
	}
	if s.taggingRepo != nil {
		if tagMap, err := s.taggingRepo.GetTagsByTargets(ctx, workspaceID, model.TagTargetTodo, ids); err == nil {
			for i := range todos {
				if tags, ok := tagMap[todos[i].ID]; ok {
					todos[i].Tags = tags
				} else {
					todos[i].Tags = []model.Tag{}
				}
			}
		}
	}
	if s.itemRepo != nil {
		if itemMap, err := s.itemRepo.ListByTodos(ctx, workspaceID, ids); err == nil {
			for i := range todos {
				if items, ok := itemMap[todos[i].ID]; ok {
					todos[i].Items = items
				} else {
					todos[i].Items = []model.TodoItem{}
				}
			}
		}
	}
}
