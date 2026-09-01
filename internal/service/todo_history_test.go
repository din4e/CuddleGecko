package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// fakeUserLookup satisfies TodoUserLookup without a users table.
type fakeUserLookup struct {
	names map[uint]string
}

func (f fakeUserLookup) GetUserByID(_ context.Context, id uint) (*model.User, error) {
	name, ok := f.names[id]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return &model.User{ID: id, Username: name}, nil
}

// newTodoServiceWithHistory wires a TodoService with a real activity repo over
// in-memory SQLite plus a fake username resolver.
func newTodoServiceWithHistory(t *testing.T) (*TodoService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}, &model.TodoActivity{}))
	repo := repository.NewTodoRepo(db)
	activityRepo := repository.NewTodoActivityRepo(db)
	svc := NewTodoService(repo, noopEventRepo{}, repo,
		WithTodoHistory(activityRepo, fakeUserLookup{names: map[uint]string{1: "alice", 2: "bob"}}))
	return svc, db
}

func listActivities(t *testing.T, svc *TodoService, todoID uint) []model.TodoActivity {
	t.Helper()
	activities, err := svc.ListActivities(context.Background(), 1, 1, todoID, 200)
	require.NoError(t, err)
	return activities
}

func TestServiceActivity_RecordsCreateUpdateToggle(t *testing.T) {
	svc, _ := newTodoServiceWithHistory(t)
	ctx := context.Background()

	todo, err := svc.Create(ctx, 1, 1, &model.Todo{Title: "orig", Description: "d1", Priority: "normal"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, 1, 1, todo.ID, &model.Todo{
		Title: "renamed", Description: "d1", Priority: "high", Status: "pending",
	}, TodoClear{})
	require.NoError(t, err)
	require.Equal(t, "renamed", updated.Title)

	_, err = svc.ToggleStatus(ctx, 1, 1, todo.ID)
	require.NoError(t, err)

	activities := listActivities(t, svc, todo.ID)
	require.Len(t, activities, 4)

	// Newest first: toggle, then the two field diffs, then the create line.
	assert.Equal(t, model.TodoActivityCompleted, activities[0].Action)
	assert.Equal(t, "pending", activities[0].OldValue)
	assert.Equal(t, "done", activities[0].NewValue)
	assert.Equal(t, "alice", activities[0].Username)

	assert.Equal(t, model.TodoActivityUpdated, activities[1].Action)
	assert.Equal(t, "priority", activities[1].Field)
	assert.Equal(t, "normal", activities[1].OldValue)
	assert.Equal(t, "high", activities[1].NewValue)

	assert.Equal(t, model.TodoActivityUpdated, activities[2].Action)
	assert.Equal(t, "title", activities[2].Field)
	assert.Equal(t, "orig", activities[2].OldValue)
	assert.Equal(t, "renamed", activities[2].NewValue)

	assert.Equal(t, model.TodoActivityCreated, activities[3].Action)
}

func TestServiceActivity_SkipUnchangedUpdate(t *testing.T) {
	svc, _ := newTodoServiceWithHistory(t)
	ctx := context.Background()

	todo, err := svc.Create(ctx, 1, 1, &model.Todo{Title: "same"})
	require.NoError(t, err)

	_, err = svc.Update(ctx, 1, 1, todo.ID, &model.Todo{Title: "same"}, TodoClear{})
	require.NoError(t, err)

	activities := listActivities(t, svc, todo.ID)
	require.Len(t, activities, 1, "no-change update must not append an activity line")
	assert.Equal(t, model.TodoActivityCreated, activities[0].Action)
}

func TestServiceActivity_PinnedAndDeleted(t *testing.T) {
	svc, db := newTodoServiceWithHistory(t)
	ctx := context.Background()

	todo, err := svc.Create(ctx, 2, 1, &model.Todo{Title: "pin me"})
	require.NoError(t, err)

	_, err = svc.TogglePin(ctx, 2, 1, todo.ID)
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, 2, 1, todo.ID))

	// After a soft delete the todo is no longer addressable through the
	// service (ownership check), so read the log straight from the repo.
	activityRepo := repository.NewTodoActivityRepo(db)
	activities, err := activityRepo.List(ctx, todo.ID, 200)
	require.NoError(t, err)
	require.Len(t, activities, 3)
	assert.Equal(t, model.TodoActivityDeleted, activities[0].Action)
	assert.Equal(t, model.TodoActivityPinned, activities[1].Action)
	assert.Equal(t, "bob", activities[0].Username)
}

func TestServiceActivity_UnknownTodo(t *testing.T) {
	svc, _ := newTodoServiceWithHistory(t)
	ctx := context.Background()

	_, err := svc.ListActivities(ctx, 1, 1, 999, 10)
	assert.ErrorIs(t, err, ErrTodoNotFound)
}
