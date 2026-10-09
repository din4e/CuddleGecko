package repository

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Todo links (todo_ids column) ---

// SetTodoIDs writes the column without going through GORM's serializer, so its
// bytes must stay interchangeable with struct-path writes: both must reload
// through the serializer and match the json_each backlink filter.
func TestTodoRepo_SetTodoIDs_MatchesSerializerFormat(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	a := mustCreateTodo(t, repo, "1", "A")
	b := mustCreateTodo(t, repo, "1", "B")

	// Struct-path write (service Update goes through Select("…", "todo_ids")).
	b.TodoIDs = []string{a.ID}
	require.NoError(t, repo.Update(ctx, b))
	loaded, err := repo.GetByID(ctx, "1", b.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{a.ID}, loaded.TodoIDs)

	// Map-path write must land in the same format.
	require.NoError(t, repo.SetTodoIDs(ctx, "1", a.ID, []string{b.ID}))
	loadedA, err := repo.GetByID(ctx, "1", a.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{b.ID}, loadedA.TodoIDs)

	// Both writes are visible to the json_each backlink filter.
	_, total, err := repo.List(ctx, "1", model.TodoListQuery{LinkingTo: &a.ID})
	require.NoError(t, err)
	assert.EqualValues(t, 1, total, "B links to A via struct path")
	linkingB := b.ID
	_, total, err = repo.List(ctx, "1", model.TodoListQuery{LinkingTo: &linkingB})
	require.NoError(t, err)
	assert.EqualValues(t, 1, total, "A links to B via SetTodoIDs")

	// SetTodoIDs with nil clears the set.
	require.NoError(t, repo.SetTodoIDs(ctx, "1", a.ID, nil))
	loadedA, err = repo.GetByID(ctx, "1", a.ID)
	require.NoError(t, err)
	assert.Empty(t, loadedA.TodoIDs)
}

func TestTodoRepo_ExistingIDs(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	a := mustCreateTodo(t, repo, "1", "A")
	b := mustCreateTodo(t, repo, "1", "B")
	otherWs := mustCreateTodo(t, repo, "2", "other workspace")
	trashed := mustCreateTodo(t, repo, "1", "trashed")
	require.NoError(t, repo.Delete(ctx, "1", trashed.ID))

	found, err := repo.ExistingIDs(ctx, "1", []string{a.ID, b.ID, otherWs.ID, trashed.ID, "9999"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{a.ID, b.ID}, found, "only live same-workspace ids count")
}

func TestTodoRepo_Duplicate_CopiesLinks(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	target := mustCreateTodo(t, repo, "1", "target")
	src := mustCreateTodo(t, repo, "1", "src")
	src.TodoIDs = []string{target.ID}
	require.NoError(t, repo.Update(ctx, src))

	clone, err := repo.Duplicate(ctx, "1", "1", src.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{target.ID}, clone.TodoIDs, "duplicate keeps the link set")
}
