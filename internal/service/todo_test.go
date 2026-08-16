package service

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type mockTodoRepo struct {
	mock.Mock
}

func (m *mockTodoRepo) Create(ctx context.Context, todo *model.Todo) error {
	return m.Called(ctx, todo).Error(0)
}

func (m *mockTodoRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error) {
	args := m.Called(ctx, workspaceID, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Todo), args.Error(1)
}

func (m *mockTodoRepo) List(ctx context.Context, workspaceID uint, q model.TodoListQuery) ([]model.Todo, int64, error) {
	args := m.Called(ctx, workspaceID, q)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]model.Todo), args.Get(1).(int64), args.Error(2)
}

func (m *mockTodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	return m.Called(ctx, todo).Error(0)
}

func (m *mockTodoRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return m.Called(ctx, workspaceID, id).Error(0)
}

func (m *mockTodoRepo) ListItems(ctx context.Context, todoID uint) ([]model.TodoItem, error) {
	args := m.Called(ctx, todoID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.TodoItem), args.Error(1)
}

func (m *mockTodoRepo) ListItemsByTodoIDs(ctx context.Context, todoIDs []uint) ([]model.TodoItem, error) {
	args := m.Called(ctx, todoIDs)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.TodoItem), args.Error(1)
}

func (m *mockTodoRepo) GetItem(ctx context.Context, todoID, itemID uint) (*model.TodoItem, error) {
	args := m.Called(ctx, todoID, itemID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.TodoItem), args.Error(1)
}

func (m *mockTodoRepo) CreateItem(ctx context.Context, item *model.TodoItem) error {
	return m.Called(ctx, item).Error(0)
}

func (m *mockTodoRepo) UpdateItem(ctx context.Context, todoID uint, item *model.TodoItem) error {
	return m.Called(ctx, todoID, item).Error(0)
}

func (m *mockTodoRepo) SetItemDone(ctx context.Context, todoID, itemID uint, done bool) error {
	return m.Called(ctx, todoID, itemID, done).Error(0)
}

func (m *mockTodoRepo) DeleteItem(ctx context.Context, todoID, itemID uint) error {
	return m.Called(ctx, todoID, itemID).Error(0)
}

func (m *mockTodoRepo) ReorderItem(ctx context.Context, todoID, itemID uint, afterItemID *uint) error {
	return m.Called(ctx, todoID, itemID, afterItemID).Error(0)
}

func (m *mockTodoRepo) ListTrash(ctx context.Context, workspaceID uint) ([]model.Todo, error) {
	args := m.Called(ctx, workspaceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Todo), args.Error(1)
}

func (m *mockTodoRepo) Restore(ctx context.Context, workspaceID, id uint) error {
	return m.Called(ctx, workspaceID, id).Error(0)
}

func (m *mockTodoRepo) PromoteItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) (*model.Todo, error) {
	args := m.Called(ctx, userID, workspaceID, todoID, itemID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Todo), args.Error(1)
}

func (m *mockTodoRepo) Duplicate(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	args := m.Called(ctx, userID, workspaceID, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Todo), args.Error(1)
}

func (m *mockTodoRepo) BulkAction(ctx context.Context, workspaceID uint, ids []uint, action string) (int64, error) {
	args := m.Called(ctx, workspaceID, ids, action)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockTodoRepo) SetPinned(ctx context.Context, workspaceID, id uint, pinned bool) error {
	return m.Called(ctx, workspaceID, id, pinned).Error(0)
}

func (m *mockTodoRepo) IncrementPomodoro(ctx context.Context, workspaceID, id uint) error {
	return m.Called(ctx, workspaceID, id).Error(0)
}

func (m *mockTodoRepo) ReplaceTags(ctx context.Context, todoID uint, tags []model.Tag) error {
	return m.Called(ctx, todoID, tags).Error(0)
}

func (m *mockTodoRepo) GetTags(ctx context.Context, todoID uint) ([]model.Tag, error) {
	args := m.Called(ctx, todoID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Tag), args.Error(1)
}

func (m *mockTodoRepo) Stats(ctx context.Context, workspaceID uint) (model.TodoStats, error) {
	args := m.Called(ctx, workspaceID)
	return args.Get(0).(model.TodoStats), args.Error(1)
}

func (m *mockTodoRepo) Reorder(ctx context.Context, workspaceID, id uint, afterID *uint) error {
	return m.Called(ctx, workspaceID, id, afterID).Error(0)
}

func (m *mockTodoRepo) Move(ctx context.Context, workspaceID, id uint, parentID, afterID *uint) error {
	return m.Called(ctx, workspaceID, id, parentID, afterID).Error(0)
}

type mockEventRepoForSync struct {
	mock.Mock
}

func (m *mockEventRepoForSync) Create(ctx context.Context, event *model.Event) error {
	return m.Called(ctx, event).Error(0)
}

func TestTodoService_Create(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("Create", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	todo, err := svc.Create(context.Background(), 1, 2, &model.Todo{Title: "test"})
	assert.NoError(t, err)
	assert.Equal(t, uint(1), todo.UserID)
	assert.Equal(t, uint(2), todo.WorkspaceID)
	assert.Equal(t, "pending", todo.Status)
	assert.Equal(t, "normal", todo.Priority)
	repo.AssertExpectations(t)
}

func TestTodoService_List(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	q := model.TodoListQuery{Page: 1, PageSize: 50}
	expected := []model.Todo{{ID: 1, Title: "a"}, {ID: 2, Title: "b"}}
	repo.On("List", mock.Anything, uint(1), q).Return(expected, int64(2), nil)

	todos, total, err := svc.List(context.Background(), 1, 1, q)
	assert.NoError(t, err)
	assert.Len(t, todos, 2)
	assert.Equal(t, int64(2), total)
	repo.AssertExpectations(t)
}

func TestTodoService_Update(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	existing := &model.Todo{ID: 1, Title: "old", Priority: "normal", Status: "pending"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	updated, err := svc.Update(context.Background(), 1, 1, 1, &model.Todo{Title: "new", Priority: "high"}, TodoClear{})
	assert.NoError(t, err)
	assert.Equal(t, "new", updated.Title)
	assert.Equal(t, "high", updated.Priority)
	repo.AssertExpectations(t)
}

func TestTodoService_Update_ClearDueTime(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	due := time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)
	existing := &model.Todo{ID: 1, Title: "task", DueTime: &due}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.MatchedBy(func(t *model.Todo) bool {
		return t.DueTime == nil
	})).Return(nil)

	updated, err := svc.Update(context.Background(), 1, 1, 1, &model.Todo{}, TodoClear{DueTime: true})
	assert.NoError(t, err)
	assert.Nil(t, updated.DueTime)
	repo.AssertExpectations(t)
}

func TestTodoService_Update_NotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.Update(context.Background(), 1, 1, 99, &model.Todo{Title: "new"}, TodoClear{})
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_ToggleStatus_PendingToDone(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	existing := &model.Todo{ID: 1, Status: "pending"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	todo, err := svc.ToggleStatus(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "done", todo.Status)
	assert.NotNil(t, todo.CompletedAt)
	repo.AssertExpectations(t)
}

func TestTodoService_ToggleStatus_DoneToPending(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	now := time.Now()
	existing := &model.Todo{ID: 1, Status: "done", CompletedAt: &now}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	todo, err := svc.ToggleStatus(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "pending", todo.Status)
	assert.Nil(t, todo.CompletedAt)
}

func TestTodoService_ToggleStatus_NotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.ToggleStatus(context.Background(), 1, 1, 99)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_SyncToEvent(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	dueTime := time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)
	existing := &model.Todo{
		ID: 1, Title: "meeting", Description: "desc",
		DueTime: &dueTime, ContactIDs: []uint{10, 20}, Color: "#ff0000",
	}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	eventRepo.On("Create", mock.Anything, mock.AnythingOfType("*model.Event")).Return(nil)

	event, err := svc.SyncToEvent(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "meeting", event.Title)
	assert.Equal(t, "desc", event.Description)
	assert.Equal(t, []uint{10, 20}, event.ContactIDs)
	assert.Equal(t, "#ff0000", event.Color)
	assert.Equal(t, dueTime, event.StartTime)
	repo.AssertExpectations(t)
	eventRepo.AssertExpectations(t)
}

func TestTodoService_SyncToEvent_NoDueTime(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	existing := &model.Todo{ID: 1, Title: "task", DueTime: nil}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	eventRepo.On("Create", mock.Anything, mock.AnythingOfType("*model.Event")).Return(nil)

	event, err := svc.SyncToEvent(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.False(t, event.StartTime.IsZero())
}

func TestTodoService_SyncToEvent_NotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.SyncToEvent(context.Background(), 1, 1, 99)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_Delete(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("Delete", mock.Anything, uint(1), uint(1)).Return(nil)

	err := svc.Delete(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestTodoService_GetByID_NotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.GetByID(context.Background(), 1, 1, 99)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_CreateItem(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, Title: "task"}, nil)
	repo.On("CreateItem", mock.Anything, mock.AnythingOfType("*model.TodoItem")).Return(nil)

	item, err := svc.CreateItem(context.Background(), 1, 1, 1, "  buy milk  ")
	assert.NoError(t, err)
	assert.Equal(t, "buy milk", item.Content)
	assert.Equal(t, uint(1), item.TodoID)
	repo.AssertExpectations(t)
}

func TestTodoService_CreateItem_EmptyContent(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)

	_, err := svc.CreateItem(context.Background(), 1, 1, 1, "   ")
	assert.ErrorIs(t, err, ErrTodoItemEmpty)
}

func TestTodoService_CreateItem_TodoNotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.CreateItem(context.Background(), 1, 1, 99, "x")
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_ToggleItem(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(5)).Return(&model.TodoItem{ID: 5, TodoID: 1, Done: false}, nil)
	repo.On("SetItemDone", mock.Anything, uint(1), uint(5), true).Return(nil)

	item, err := svc.ToggleItem(context.Background(), 1, 1, 1, 5)
	assert.NoError(t, err)
	assert.True(t, item.Done)
	repo.AssertExpectations(t)
}

func TestTodoService_DeleteItem(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(5)).Return(&model.TodoItem{ID: 5, Done: true}, nil)
	repo.On("DeleteItem", mock.Anything, uint(1), uint(5)).Return(nil)

	err := svc.DeleteItem(context.Background(), 1, 1, 1, 5)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestTodoService_ReorderItem(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	after := uint(2)
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(5)).Return(&model.TodoItem{ID: 5}, nil)
	repo.On("ReorderItem", mock.Anything, uint(1), uint(5), &after).Return(nil)

	err := svc.ReorderItem(context.Background(), 1, 1, 1, 5, &after)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestTodoService_PromoteItem(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(5)).Return(&model.TodoItem{ID: 5, Content: "step"}, nil)
	repo.On("PromoteItem", mock.Anything, uint(1), uint(1), uint(1), uint(5)).Return(&model.Todo{ID: 9, Title: "step"}, nil)

	todo, err := svc.PromoteItem(context.Background(), 1, 1, 1, 5)
	assert.NoError(t, err)
	assert.Equal(t, "step", todo.Title)
	repo.AssertExpectations(t)
}

func TestTodoService_Duplicate(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, Title: "original"}, nil)
	repo.On("Duplicate", mock.Anything, uint(1), uint(1), uint(1)).Return(&model.Todo{ID: 9, Title: "original", Status: "pending"}, nil)

	clone, err := svc.Duplicate(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "pending", clone.Status)
	repo.AssertExpectations(t)
}

func TestTodoService_BulkAction(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("BulkAction", mock.Anything, uint(1), []uint{1, 2}, "delete").Return(int64(2), nil)

	affected, err := svc.BulkAction(context.Background(), 1, 1, []uint{1, 2}, "delete")
	assert.NoError(t, err)
	assert.Equal(t, int64(2), affected)
	repo.AssertExpectations(t)
}

func TestTodoService_TogglePin(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, Pinned: false}, nil)
	repo.On("SetPinned", mock.Anything, uint(1), uint(1), true).Return(nil)

	todo, err := svc.TogglePin(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.True(t, todo.Pinned)
	repo.AssertExpectations(t)
}

func TestTodoService_ReplaceTags(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("ReplaceTags", mock.Anything, uint(1), mock.MatchedBy(func(tags []model.Tag) bool {
		return len(tags) == 2 && tags[0].ID == 7 && tags[1].ID == 8
	})).Return(nil)

	err := svc.ReplaceTags(context.Background(), 1, 1, 1, []uint{7, 8})
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestTodoService_Reorder(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	after := uint(2)
	repo.On("GetByID", mock.Anything, uint(1), uint(3)).Return(&model.Todo{ID: 3}, nil)
	repo.On("Reorder", mock.Anything, uint(1), uint(3), &after).Return(nil)

	err := svc.Reorder(context.Background(), 1, 1, 3, &after)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestTodoService_Reorder_ToTop(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(3)).Return(&model.Todo{ID: 3}, nil)
	repo.On("Reorder", mock.Anything, uint(1), uint(3), (*uint)(nil)).Return(nil)

	err := svc.Reorder(context.Background(), 1, 1, 3, nil)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestNextDueTime(t *testing.T) {
	mon := time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC) // Monday
	fri := time.Date(2024, 1, 5, 9, 0, 0, 0, time.UTC) // Friday

	cases := []struct {
		name     string
		rule     string
		interval int
		from     time.Time
		want     time.Time
		ok       bool
	}{
		{"daily", "daily", 1, mon, mon.AddDate(0, 0, 1), true},
		{"weekly", "weekly", 1, mon, mon.AddDate(0, 0, 7), true},
		{"monthly", "monthly", 1, mon, mon.AddDate(0, 1, 0), true},
		{"yearly", "yearly", 1, mon, mon.AddDate(1, 0, 0), true},
		{"weekdays Monday->Tuesday", "weekdays", 1, mon, mon.AddDate(0, 0, 1), true},
		{"every 2 days", "daily", 2, mon, mon.AddDate(0, 0, 2), true},
		{"every 3 weeks", "weekly", 3, mon, mon.AddDate(0, 0, 21), true},
		{"every 2 months", "monthly", 2, mon, mon.AddDate(0, 2, 0), true},
		{"interval 0 treated as 1", "daily", 0, mon, mon.AddDate(0, 0, 1), true},
		{"unknown rule", "bogus", 1, mon, mon, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// now == from so there is no fast-forward.
			got, ok := model.NextDueTime(tc.rule, tc.interval, tc.from, tc.from)
			assert.Equal(t, tc.ok, ok)
			if ok {
				assert.Equal(t, tc.want, got)
			}
		})
	}

	// weekdays from Friday skips the weekend to Monday.
	got, ok := model.NextDueTime("weekdays", 1, fri, fri)
	assert.True(t, ok)
	assert.Equal(t, time.Monday, got.Weekday())

	// every-2-weekdays from Monday lands on Wednesday (Mon->Tue->Wed).
	got, ok = model.NextDueTime("weekdays", 2, mon, mon)
	assert.True(t, ok)
	assert.Equal(t, time.Wednesday, got.Weekday())

	// An overdue daily task fast-forwards to the next future occurrence.
	overdue := time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC)
	futureNow := time.Date(2026, 8, 4, 0, 0, 0, 0, time.UTC)
	next, ok := model.NextDueTime("daily", 1, overdue, futureNow)
	assert.True(t, ok)
	assert.False(t, next.Before(futureNow))
}

func TestTodoService_ToggleStatus_RecurringAdvances(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)

	due := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	existing := &model.Todo{ID: 1, Status: "pending", Repeat: "daily", DueTime: &due}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.MatchedBy(func(td *model.Todo) bool {
		return td.Status == "pending" && td.DueTime != nil && td.DueTime.After(due) && td.CompletedAt == nil
	})).Return(nil)

	todo, err := svc.ToggleStatus(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "pending", todo.Status)
	assert.True(t, todo.DueTime.After(due))
	repo.AssertExpectations(t)
}
