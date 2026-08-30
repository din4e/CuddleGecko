package repository

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// childrenOf loads the direct children of parentID (nil = root) ordered by sort_order.
func childrenOf(t *testing.T, repo *TodoRepo, ws uint, parentID *uint) []model.Todo {
	t.Helper()
	var all []model.Todo
	require.NoError(t, repo.db.WithContext(context.Background()).
		Where("workspace_id = ?", ws).Order("sort_order ASC, id ASC").Find(&all).Error)
	out := []model.Todo{}
	for _, x := range all {
		if parentID == nil && x.ParentID == nil {
			out = append(out, x)
		} else if parentID != nil && x.ParentID != nil && *x.ParentID == *parentID {
			out = append(out, x)
		}
	}
	return out
}

func TestTodoRepo_Move_ReparentAndSiblingOrder(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	a := mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")

	// Nest a then b under root (b placed after a).
	require.NoError(t, repo.Move(ctx, 1, a.ID, &root.ID, nil, ""))
	require.NoError(t, repo.Move(ctx, 1, b.ID, &root.ID, &a.ID, ""))

	a2, err := repo.GetByID(ctx, 1, a.ID)
	require.NoError(t, err)
	b2, err := repo.GetByID(ctx, 1, b.ID)
	require.NoError(t, err)
	require.NotNil(t, a2.ParentID)
	require.NotNil(t, b2.ParentID)
	assert.Equal(t, root.ID, *a2.ParentID)
	assert.Equal(t, root.ID, *b2.ParentID)

	sibs := childrenOf(t, repo, 1, &root.ID)
	require.Len(t, sibs, 2)
	assert.Equal(t, a.ID, sibs[0].ID)
	assert.Equal(t, b.ID, sibs[1].ID, "b should follow a")
	assert.Less(t, sibs[0].SortOrder, sibs[1].SortOrder)
}

// Move with position "last" appends at the end of the sibling group — the
// semantic drag-and-drop nesting relies on when the client doesn't know the
// current last child id (collapsed/lazy-loaded parents).
func TestTodoRepo_Move_AppendLast(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	a := mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")
	c := mustCreateTodo(t, repo, 1, "c")
	require.NoError(t, repo.Move(ctx, 1, a.ID, &root.ID, nil, ""))
	require.NoError(t, repo.Move(ctx, 1, b.ID, &root.ID, &a.ID, ""))

	require.NoError(t, repo.Move(ctx, 1, c.ID, &root.ID, nil, "last"))
	sibs := childrenOf(t, repo, 1, &root.ID)
	require.Len(t, sibs, 3)
	assert.Equal(t, []uint{a.ID, b.ID, c.ID}, []uint{sibs[0].ID, sibs[1].ID, sibs[2].ID},
		"'last' must append after all existing children, not at the top")

	// after_id wins over position when both are given.
	d := mustCreateTodo(t, repo, 1, "d")
	require.NoError(t, repo.Move(ctx, 1, d.ID, &root.ID, &a.ID, "last"))
	sibs = childrenOf(t, repo, 1, &root.ID)
	require.Len(t, sibs, 4)
	assert.Equal(t, []uint{a.ID, d.ID, b.ID, c.ID}, []uint{sibs[0].ID, sibs[1].ID, sibs[2].ID, sibs[3].ID},
		"after_id must take precedence over position")
}

func TestTodoRepo_Move_SelfParent(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	a := mustCreateTodo(t, repo, 1, "a")
	pid := a.ID
	assert.ErrorIs(t, repo.Move(context.Background(), 1, a.ID, &pid, nil, ""), ErrTodoSelfParent)
}

func TestTodoRepo_Move_Cycle(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	child := mustCreateTodo(t, repo, 1, "child")
	require.NoError(t, repo.Move(ctx, 1, child.ID, &root.ID, nil, "")) // child under root

	// Moving root under its own descendant must be rejected.
	assert.ErrorIs(t, repo.Move(ctx, 1, root.ID, &child.ID, nil, ""), ErrTodoCycle)
}

// TestTodoRepo_Move_DeepCycle builds a multi-level chain so the cycle check
// must walk 2+ ancestors — exercising the recursive-CTE walk, not a one-hop
// check. Also guards against false positives on an unrelated todo.
func TestTodoRepo_Move_DeepCycle(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	// Chain: root -> mid -> leaf.
	root := mustCreateTodo(t, repo, 1, "root")
	mid := mustCreateTodo(t, repo, 1, "mid")
	require.NoError(t, repo.Move(ctx, 1, mid.ID, &root.ID, nil, "")) // mid under root
	leaf := mustCreateTodo(t, repo, 1, "leaf")
	require.NoError(t, repo.Move(ctx, 1, leaf.ID, &mid.ID, nil, "")) // leaf under mid

	// Moving root under a deep descendant requires walking 2 ancestors to detect.
	assert.ErrorIs(t, repo.Move(ctx, 1, root.ID, &leaf.ID, nil, ""), ErrTodoCycle)
	assert.ErrorIs(t, repo.Move(ctx, 1, root.ID, &mid.ID, nil, ""), ErrTodoCycle)

	// An unrelated todo can still be moved under leaf (no false cycle).
	other := mustCreateTodo(t, repo, 1, "other")
	assert.NoError(t, repo.Move(ctx, 1, other.ID, &leaf.ID, nil, ""))
}

func TestTodoRepo_Move_InvalidParent(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ws1 := mustCreateTodo(t, repo, 1, "ws1 todo")
	ws2 := mustCreateTodo(t, repo, 2, "ws2 todo") // different workspace

	// A parent from another workspace is not visible → invalid parent.
	pid := ws2.ID
	assert.ErrorIs(t, repo.Move(context.Background(), 1, ws1.ID, &pid, nil, ""), ErrTodoInvalidParent)
}

func TestTodoRepo_Move_ToRoot(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	child := mustCreateTodo(t, repo, 1, "child")
	require.NoError(t, repo.Move(ctx, 1, child.ID, &root.ID, nil, ""))
	require.NoError(t, repo.Move(ctx, 1, child.ID, nil, nil, "")) // back to root

	c, err := repo.GetByID(ctx, 1, child.ID)
	require.NoError(t, err)
	assert.Nil(t, c.ParentID)
}

func TestTodoRepo_Delete_CascadesDescendants(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	a := mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")
	require.NoError(t, repo.Move(ctx, 1, a.ID, &root.ID, nil, "")) // a under root
	require.NoError(t, repo.Move(ctx, 1, b.ID, &a.ID, nil, ""))     // b under a (depth 2)

	require.NoError(t, repo.Delete(ctx, 1, root.ID))

	for _, id := range []uint{root.ID, a.ID, b.ID} {
		_, err := repo.GetByID(ctx, 1, id)
		assert.ErrorIs(t, err, gorm.ErrRecordNotFound, "descendant %d should be soft-deleted with parent", id)
	}
}

func TestTodoRepo_Restore_CascadesDescendants(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	a := mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")
	require.NoError(t, repo.Move(ctx, 1, a.ID, &root.ID, nil, ""))
	require.NoError(t, repo.Move(ctx, 1, b.ID, &a.ID, nil, ""))
	require.NoError(t, repo.Delete(ctx, 1, root.ID)) // cascade-deletes root, a, b

	// Restoring the parent brings the whole subtree back (mirror of cascade delete).
	require.NoError(t, repo.Restore(ctx, 1, root.ID))
	for _, id := range []uint{root.ID, a.ID, b.ID} {
		_, err := repo.GetByID(ctx, 1, id)
		assert.NoError(t, err, "descendant %d should be restored with its parent", id)
	}
}

func TestTodoRepo_Duplicate_PreservesParent(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	parent := mustCreateTodo(t, repo, 1, "parent")
	child := mustCreateTodo(t, repo, 1, "child")
	require.NoError(t, repo.Move(ctx, 1, child.ID, &parent.ID, nil, "")) // child nested under parent

	clone, err := repo.Duplicate(ctx, 1, 1, child.ID)
	require.NoError(t, err)
	require.NotNil(t, clone.ParentID, "duplicated nested todo should stay under the same parent (sibling copy)")
	assert.Equal(t, parent.ID, *clone.ParentID)
	assert.NotEqual(t, child.ID, clone.ID)
}

func TestTodoRepo_BulkDelete_Cascades(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	root := mustCreateTodo(t, repo, 1, "root")
	a := mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")
	require.NoError(t, repo.Move(ctx, 1, a.ID, &root.ID, nil, ""))
	require.NoError(t, repo.Move(ctx, 1, b.ID, &a.ID, nil, "")) // root > a > b

	// Bulk-delete only the root → the whole subtree is removed (consistent with
	// single Delete, which cascades).
	affected, err := repo.BulkAction(ctx, 1, []uint{root.ID}, "delete")
	require.NoError(t, err)
	assert.GreaterOrEqual(t, affected, int64(3))
	for _, id := range []uint{root.ID, a.ID, b.ID} {
		_, err := repo.GetByID(ctx, 1, id)
		assert.ErrorIs(t, err, gorm.ErrRecordNotFound, "descendant %d should be cascade-deleted by bulk delete", id)
	}
}

func TestTodoRepo_IncrementPomodoro(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()
	todo := mustCreateTodo(t, repo, 1, "focus")
	assert.Equal(t, 0, todo.PomodoroCount, "starts at 0")

	require.NoError(t, repo.IncrementPomodoro(ctx, 1, todo.ID))
	require.NoError(t, repo.IncrementPomodoro(ctx, 1, todo.ID))

	got, err := repo.GetByID(ctx, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, got.PomodoroCount, "atomic +1 twice")
}
