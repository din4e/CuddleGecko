package service

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// noopEventRepo satisfies EventRepositoryForSync without touching the DB; these
// tests don't exercise SyncToEvent.
type noopEventRepo struct{}

func (noopEventRepo) Create(context.Context, *model.Event) error { return nil }

// newTodoServiceWithDB wires a real TodoService over an in-memory SQLite DB.
func newTodoServiceWithDB(t *testing.T) (*TodoService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}))
	repo := repository.NewTodoRepo(db)
	return NewTodoService(repo, noopEventRepo{}, repo), db
}

func intCreateTodo(t *testing.T, svc *TodoService, title string) *model.Todo {
	t.Helper()
	todo, err := svc.Create(context.Background(), 1, 1, &model.Todo{Title: title})
	require.NoError(t, err)
	return todo
}

// --- ToggleStatus: recurring tasks advance their due time and stay pending ---

func TestServiceIntegration_ToggleStatus_Recurring(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()

	past := time.Date(2020, 1, 1, 9, 0, 0, 0, time.UTC)
	todo := intCreateTodo(t, svc, "standup")
	todo.Repeat = "daily"
	todo.DueTime = &past
	require.NoError(t, ctxUpdate(svc, ctx, todo))

	result, err := svc.ToggleStatus(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, "pending", result.Status, "recurring task stays pending")
	assert.NotNil(t, result.DueTime)
	assert.True(t, result.DueTime.After(past), "due time advanced")
	assert.Nil(t, result.CompletedAt)

	// The advanced due time actually persisted.
	loaded, err := svc.GetByID(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.True(t, loaded.DueTime.After(past))
}

// ctxUpdate is a tiny helper to persist field changes via the service Update.
func ctxUpdate(svc *TodoService, ctx context.Context, todo *model.Todo) error {
	_, err := svc.Update(ctx, 1, 1, todo.ID, &model.Todo{
		Title: todo.Title, Repeat: todo.Repeat, DueTime: todo.DueTime,
	}, TodoClear{})
	return err
}

// --- Normal toggle persists done state ---

func TestServiceIntegration_ToggleStatus_Normal(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	todo := intCreateTodo(t, svc, "one-off")

	done, err := svc.ToggleStatus(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, "done", done.Status)
	assert.NotNil(t, done.CompletedAt)

	again, err := svc.ToggleStatus(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, "pending", again.Status)
	assert.Nil(t, again.CompletedAt)
}

// --- Checklist items: ownership gating + count sync through the service ---

func TestServiceIntegration_Items(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	todo := intCreateTodo(t, svc, "parent")

	// Wrong workspace is rejected before touching items.
	_, err := svc.CreateItem(ctx, 1, 99, todo.ID, "x")
	assert.ErrorIs(t, err, ErrTodoNotFound)

	a, err := svc.CreateItem(ctx, 1, 1, todo.ID, "a")
	require.NoError(t, err)
	b, err := svc.CreateItem(ctx, 1, 1, todo.ID, "b")
	require.NoError(t, err)

	loaded, err := svc.GetByID(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, loaded.ItemTotal)
	assert.Equal(t, 0, loaded.ItemDone)

	// Toggle both done → counts follow.
	_, err = svc.ToggleItem(ctx, 1, 1, todo.ID, a.ID)
	require.NoError(t, err)
	_, err = svc.ToggleItem(ctx, 1, 1, todo.ID, b.ID)
	require.NoError(t, err)
	loaded, _ = svc.GetByID(ctx, 1, 1, todo.ID)
	assert.Equal(t, 2, loaded.ItemDone)

	// Delete a done item → done count drops.
	require.NoError(t, svc.DeleteItem(ctx, 1, 1, todo.ID, a.ID))
	loaded, _ = svc.GetByID(ctx, 1, 1, todo.ID)
	assert.Equal(t, 1, loaded.ItemTotal)
	assert.Equal(t, 1, loaded.ItemDone)
}

// --- PromoteItem creates a standalone todo and removes the source item ---

func TestServiceIntegration_PromoteItem(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	todo := intCreateTodo(t, svc, "parent")
	item, err := svc.CreateItem(ctx, 1, 1, todo.ID, "becomes-a-task")
	require.NoError(t, err)

	promoted, err := svc.PromoteItem(ctx, 1, 1, todo.ID, item.ID)
	require.NoError(t, err)
	assert.Equal(t, "becomes-a-task", promoted.Title)

	// Parent lost the item; promoted todo is now top-level.
	parent, _ := svc.GetByID(ctx, 1, 1, todo.ID)
	assert.Equal(t, 0, parent.ItemTotal)
	todos, total, err := svc.List(ctx, 1, 1, model.TodoListQuery{Sort: model.TodoSortCreated})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	// created-asc order: parent first, promoted last.
	assert.Equal(t, promoted.ID, todos[1].ID)
}

// --- Duplicate copies items through the service ---

func TestServiceIntegration_Duplicate(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	todo := intCreateTodo(t, svc, "original")
	_, err := svc.CreateItem(ctx, 1, 1, todo.ID, "a")
	require.NoError(t, err)
	_, err = svc.CreateItem(ctx, 1, 1, todo.ID, "b")
	require.NoError(t, err)

	clone, err := svc.Duplicate(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, "pending", clone.Status)
	assert.Equal(t, 2, clone.ItemTotal)

	items, err := svc.ListItems(ctx, 1, 1, clone.ID)
	require.NoError(t, err)
	assert.Len(t, items, 2)
}

// --- Reorder changes the persisted manual order ---

func TestServiceIntegration_Reorder(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	a := intCreateTodo(t, svc, "a")
	b := intCreateTodo(t, svc, "b")
	c := intCreateTodo(t, svc, "c")

	require.NoError(t, svc.Reorder(ctx, 1, 1, c.ID, &a.ID)) // → a, c, b

	todos, _, err := svc.List(ctx, 1, 1, model.TodoListQuery{Sort: model.TodoSortManual})
	require.NoError(t, err)
	require.Len(t, todos, 3)
	assert.Equal(t, []uint{a.ID, c.ID, b.ID}, []uint{todos[0].ID, todos[1].ID, todos[2].ID})
}

// --- TogglePin persists and Duplicate is ownership-scoped ---

func TestServiceIntegration_TogglePin(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	todo := intCreateTodo(t, svc, "star me")

	pinned, err := svc.TogglePin(ctx, 1, 1, todo.ID)
	require.NoError(t, err)
	assert.True(t, pinned.Pinned)

	loaded, _ := svc.GetByID(ctx, 1, 1, todo.ID)
	assert.True(t, loaded.Pinned, "pin persisted")
}

func TestServiceIntegration_OwnershipNotFound(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()

	_, err := svc.Update(ctx, 1, 1, 999, &model.Todo{Title: "x"}, TodoClear{})
	assert.ErrorIs(t, err, ErrTodoNotFound)
	_, err = svc.Duplicate(ctx, 1, 1, 999)
	assert.ErrorIs(t, err, ErrTodoNotFound)
	_, err = svc.TogglePin(ctx, 1, 1, 999)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}
