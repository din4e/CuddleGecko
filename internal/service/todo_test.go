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

func (m *mockTodoRepo) List(ctx context.Context, workspaceID uint, status *string, page, pageSize int) ([]model.Todo, int64, error) {
	args := m.Called(ctx, workspaceID, status, page, pageSize)
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

type mockEventRepoForSync struct {
	mock.Mock
}

func (m *mockEventRepoForSync) Create(ctx context.Context, event *model.Event) error {
	return m.Called(ctx, event).Error(0)
}

func TestTodoService_Create(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

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
	svc := NewTodoService(repo, eventRepo)

	expected := []model.Todo{{ID: 1, Title: "a"}, {ID: 2, Title: "b"}}
	repo.On("List", mock.Anything, uint(1), (*string)(nil), 1, 50).Return(expected, int64(2), nil)

	todos, total, err := svc.List(context.Background(), 1, 1, nil, 1, 50)
	assert.NoError(t, err)
	assert.Len(t, todos, 2)
	assert.Equal(t, int64(2), total)
	repo.AssertExpectations(t)
}

func TestTodoService_Update(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

	existing := &model.Todo{ID: 1, Title: "old", Priority: "normal", Status: "pending"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	updated, err := svc.Update(context.Background(), 1, 1, 1, &model.Todo{Title: "new", Priority: "high"})
	assert.NoError(t, err)
	assert.Equal(t, "new", updated.Title)
	assert.Equal(t, "high", updated.Priority)
	repo.AssertExpectations(t)
}

func TestTodoService_Update_NotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.Update(context.Background(), 1, 1, 99, &model.Todo{Title: "new"})
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_ToggleStatus_PendingToDone(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

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
	svc := NewTodoService(repo, eventRepo)

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
	svc := NewTodoService(repo, eventRepo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.ToggleStatus(context.Background(), 1, 1, 99)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_SyncToEvent(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

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
	svc := NewTodoService(repo, eventRepo)

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
	svc := NewTodoService(repo, eventRepo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.SyncToEvent(context.Background(), 1, 1, 99)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}

func TestTodoService_Delete(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

	repo.On("Delete", mock.Anything, uint(1), uint(1)).Return(nil)

	err := svc.Delete(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestTodoService_GetByID_NotFound(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, ErrTodoNotFound)

	_, err := svc.GetByID(context.Background(), 1, 1, 99)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}
