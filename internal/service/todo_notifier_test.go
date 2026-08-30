package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// captureNotifier records every NotifyTodoChange call so tests can assert the
// service emits the right (workspace, todo, kind) tuple for each mutation.
type captureNotifier struct {
	events []capturedChange
}

type capturedChange struct {
	workspaceID uint
	todoID      uint
	kind        TodoChangeKind
}

func (n *captureNotifier) NotifyTodoChange(_ context.Context, workspaceID, todoID uint, kind TodoChangeKind) {
	n.events = append(n.events, capturedChange{workspaceID: workspaceID, todoID: todoID, kind: kind})
}

func newNotifiedService(n *captureNotifier) (*TodoService, *mockTodoRepo) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	return NewTodoService(repo, eventRepo, repo, WithTodoNotifier(n)), repo
}

func TestTodoNotifier_Create(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	repo.On("Create", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	_, err := svc.Create(context.Background(), 1, 2, &model.Todo{ID: 5, Title: "test"})
	assert.NoError(t, err)
	assert.Equal(t, []capturedChange{{2, 5, TodoCreated}}, n.events)
}

func TestTodoNotifier_Update(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	existing := &model.Todo{ID: 7, WorkspaceID: 2, Title: "x"}
	repo.On("GetByID", mock.Anything, uint(2), uint(7)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	_, err := svc.Update(context.Background(), 1, 2, 7, &model.Todo{Title: "y"}, TodoClear{})
	assert.NoError(t, err)
	assert.Equal(t, []capturedChange{{2, 7, TodoUpdated}}, n.events)
}

func TestTodoNotifier_Delete(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	repo.On("Delete", mock.Anything, uint(1), uint(1)).Return(nil)

	err := svc.Delete(context.Background(), 1, 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, []capturedChange{{1, 1, TodoDeleted}}, n.events)
}

func TestTodoNotifier_CreateItem(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	repo.On("GetByID", mock.Anything, uint(2), uint(3)).Return(&model.Todo{ID: 3, WorkspaceID: 2}, nil)
	repo.On("CreateItem", mock.Anything, mock.AnythingOfType("*model.TodoItem")).Return(nil)

	_, err := svc.CreateItem(context.Background(), 1, 2, 3, "step")
	assert.NoError(t, err)
	// items_changed targets the PARENT todo so card progress counters refresh.
	assert.Equal(t, []capturedChange{{2, 3, TodoItemsChanged}}, n.events)
}

func TestTodoNotifier_BulkAction(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	repo.On("BulkAction", mock.Anything, uint(2), []uint{10, 11}, "complete").Return(int64(2), nil)

	affected, err := svc.BulkAction(context.Background(), 1, 2, []uint{10, 11}, "complete")
	assert.NoError(t, err)
	assert.Equal(t, int64(2), affected)
	// Bulk fans out a workspace-wide refresh (todo_id 0).
	assert.Equal(t, []capturedChange{{2, 0, TodoBulk}}, n.events)
}

func TestTodoNotifier_BulkAction_NoopWhenUnaffected(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	repo.On("BulkAction", mock.Anything, uint(2), []uint{99}, "complete").Return(int64(0), nil)

	_, err := svc.BulkAction(context.Background(), 1, 2, []uint{99}, "complete")
	assert.NoError(t, err)
	assert.Empty(t, n.events, "no notification when nothing was affected")
}

func TestTodoNotifier_TogglePin(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	repo.On("GetByID", mock.Anything, uint(2), uint(9)).Return(&model.Todo{ID: 9, WorkspaceID: 2}, nil)
	repo.On("SetPinned", mock.Anything, uint(2), uint(9), true).Return(nil)

	_, err := svc.TogglePin(context.Background(), 1, 2, 9)
	assert.NoError(t, err)
	assert.Equal(t, []capturedChange{{2, 9, TodoUpdated}}, n.events)
}

func TestTodoNotifier_NoopDefaultDoesNotPanic(t *testing.T) {
	// The default (no notifier wired) is a no-op — must not panic on mutation.
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo) // no WithTodoNotifier
	repo.On("Create", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	_, err := svc.Create(context.Background(), 1, 2, &model.Todo{Title: "x"})
	assert.NoError(t, err)
}

func TestTodoNotifier_Move(t *testing.T) {
	n := &captureNotifier{}
	svc, repo := newNotifiedService(n)
	// ensureTodoOwned (GetByID) + repo.Move
	repo.On("GetByID", mock.Anything, uint(2), uint(5)).Return(&model.Todo{ID: 5, WorkspaceID: 2}, nil)
	repo.On("Move", mock.Anything, uint(2), uint(5), mock.Anything, mock.Anything, mock.Anything).Return(nil)

	err := svc.Move(context.Background(), 1, 2, 5, nil, nil, "")
	assert.NoError(t, err)
	// Move fans out a workspace-wide refresh (sibling order may shift).
	assert.Equal(t, []capturedChange{{2, 0, TodoBulk}}, n.events)
}

func TestTodoService_Create_WithValidParent(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)
	pid := uint(5)
	repo.On("GetByID", mock.Anything, uint(2), uint(5)).Return(&model.Todo{ID: 5, WorkspaceID: 2}, nil)
	repo.On("Create", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	todo, err := svc.Create(context.Background(), 1, 2, &model.Todo{Title: "child", ParentID: &pid})
	assert.NoError(t, err)
	require.NotNil(t, todo.ParentID)
	assert.Equal(t, uint(5), *todo.ParentID)
}

func TestTodoService_Create_RejectsInvalidParent(t *testing.T) {
	repo := new(mockTodoRepo)
	eventRepo := new(mockEventRepoForSync)
	svc := NewTodoService(repo, eventRepo, repo)
	pid := uint(99)
	repo.On("GetByID", mock.Anything, uint(2), uint(99)).Return(nil, assert.AnError)

	_, err := svc.Create(context.Background(), 1, 2, &model.Todo{Title: "child", ParentID: &pid})
	assert.ErrorIs(t, err, ErrTodoInvalidParent)
	repo.AssertNotCalled(t, "Create", "must not persist when the parent is invalid")
}
