package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Todo links (todo_ids): validation, persistence, backlink filter ---

func TestServiceIntegration_TodoLinks_CRUD(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()

	targetA := intCreateTodo(t, svc, "target A")
	targetB := intCreateTodo(t, svc, "target B")

	// Create with links (deduped on the way in).
	created, err := svc.Create(ctx, "1", "1", &model.Todo{
		Title:   "hub",
		TodoIDs: []string{targetA.ID, targetB.ID, targetA.ID},
	})
	require.NoError(t, err)
	assert.Equal(t, []string{targetA.ID, targetB.ID}, created.TodoIDs, "duplicate links collapse")

	// Links persisted and reload intact.
	loaded, err := svc.GetByID(ctx, "1", "1", created.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{targetA.ID, targetB.ID}, loaded.TodoIDs)

	// Update replaces the whole set.
	updated, err := svc.Update(ctx, "1", "1", created.ID, &model.Todo{
		Title:   "hub",
		TodoIDs: []string{targetB.ID},
	}, TodoClear{})
	require.NoError(t, err)
	assert.Equal(t, []string{targetB.ID}, updated.TodoIDs)

	// Empty update payload clears the links (nil normalizes to no links).
	cleared, err := svc.Update(ctx, "1", "1", created.ID, &model.Todo{Title: "hub"}, TodoClear{})
	require.NoError(t, err)
	assert.Empty(t, cleared.TodoIDs)
}

func TestServiceIntegration_TodoLinks_Validation(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()

	target := intCreateTodo(t, svc, "target")
	hub := intCreateTodo(t, svc, "hub")

	// Self-link rejected.
	_, err := svc.Update(ctx, "1", "1", hub.ID, &model.Todo{TodoIDs: []string{hub.ID}}, TodoClear{})
	assert.ErrorIs(t, err, ErrInvalidTodo)

	// Unknown / cross-workspace target rejected.
	_, err = svc.Update(ctx, "1", "1", hub.ID, &model.Todo{TodoIDs: []string{"9999"}}, TodoClear{})
	assert.ErrorIs(t, err, ErrInvalidTodo)

	// Soft-deleted target no longer counts as linkable.
	require.NoError(t, svc.Delete(ctx, "1", "1", target.ID))
	_, err = svc.Update(ctx, "1", "1", hub.ID, &model.Todo{TodoIDs: []string{target.ID}}, TodoClear{})
	assert.ErrorIs(t, err, ErrInvalidTodo)

	// Workspace scoping: another workspace's todo is not linkable.
	otherWs, err := svc.Create(ctx, "1", "2", &model.Todo{Title: "other ws"})
	require.NoError(t, err)
	_, err = svc.Update(ctx, "1", "1", hub.ID, &model.Todo{TodoIDs: []string{otherWs.ID}}, TodoClear{})
	assert.ErrorIs(t, err, ErrInvalidTodo)
}

func TestServiceIntegration_TodoLinks_BacklinkFilter(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()

	target := intCreateTodo(t, svc, "target")
	unrelated := intCreateTodo(t, svc, "unrelated")
	linker, err := svc.Create(ctx, "1", "1", &model.Todo{Title: "linker", TodoIDs: []string{target.ID}})
	require.NoError(t, err)

	todos, total, err := svc.List(ctx, "1", "1", model.TodoListQuery{LinkingTo: &target.ID})
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, todos, 1)
	assert.Equal(t, linker.ID, todos[0].ID)

	// A todo nobody links to has an empty backlink set.
	_, total, err = svc.List(ctx, "1", "1", model.TodoListQuery{LinkingTo: &unrelated.ID})
	require.NoError(t, err)
	assert.EqualValues(t, 0, total)
}
