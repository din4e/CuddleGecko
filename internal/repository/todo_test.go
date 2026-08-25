package repository

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// newTodoTestDB returns an in-memory SQLite database with the todo-related
// tables migrated. A single open connection keeps the in-memory DB stable
// across queries.
func newTodoTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}))
	return db
}

func mustCreateTodo(t *testing.T, repo *TodoRepo, ws uint, title string) *model.Todo {
	t.Helper()
	todo := &model.Todo{UserID: 1, WorkspaceID: ws, Title: title, Status: "pending", Priority: "normal"}
	require.NoError(t, repo.Create(context.Background(), todo))
	return todo
}

// --- Checklist item count sync ---

func TestTodoRepo_ItemCounts(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	todo := mustCreateTodo(t, repo, 1, "parent")

	a := &model.TodoItem{TodoID: todo.ID, Content: "a"}
	b := &model.TodoItem{TodoID: todo.ID, Content: "b"}
	require.NoError(t, repo.CreateItem(ctx, a))
	require.NoError(t, repo.CreateItem(ctx, b))

	parent, err := repo.GetByID(ctx, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, parent.ItemTotal, "item_total after create")
	assert.Equal(t, 0, parent.ItemDone)

	require.NoError(t, repo.SetItemDone(ctx, todo.ID, a.ID, true))
	parent, _ = repo.GetByID(ctx, 1, todo.ID)
	assert.Equal(t, 1, parent.ItemDone, "item_done after toggle on")

	require.NoError(t, repo.SetItemDone(ctx, todo.ID, a.ID, false))
	parent, _ = repo.GetByID(ctx, 1, todo.ID)
	assert.Equal(t, 0, parent.ItemDone, "item_done after toggle off")

	require.NoError(t, repo.SetItemDone(ctx, todo.ID, b.ID, true))
	require.NoError(t, repo.DeleteItem(ctx, todo.ID, b.ID))
	parent, _ = repo.GetByID(ctx, 1, todo.ID)
	assert.Equal(t, 1, parent.ItemTotal, "item_total after delete")
	assert.Equal(t, 0, parent.ItemDone, "item_done after deleting the only done item")
}

// --- Lazy tree: roots_only / parent_id filters + child_count ---

func TestTodoRepo_List_RootsOnlyParentAndChildCount(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()

	root := mustCreateTodo(t, repo, 1, "root")
	child := mustCreateTodo(t, repo, 1, "child")
	grandchild := mustCreateTodo(t, repo, 1, "grandchild")
	mustCreateTodo(t, repo, 1, "standalone")
	require.NoError(t, repo.SetParent(ctx, 1, child.ID, &root.ID))
	require.NoError(t, repo.SetParent(ctx, 1, grandchild.ID, &child.ID))
	// Soft-delete a child so its parent's count drops.
	deleted := mustCreateTodo(t, repo, 1, "deleted-child")
	require.NoError(t, repo.SetParent(ctx, 1, deleted.ID, &root.ID))
	require.NoError(t, repo.Delete(ctx, 1, deleted.ID))
	// Other-workspace child must not leak into counts.
	other := mustCreateTodo(t, repo, 2, "other-ws-child")
	require.NoError(t, repo.SetParent(ctx, 2, other.ID, &root.ID))

	// Roots only: two top-level todos, each reporting its direct child count.
	roots, total, err := repo.List(ctx, 1, model.TodoListQuery{RootsOnly: true})
	require.NoError(t, err)
	assert.EqualValues(t, 2, total)
	require.Len(t, roots, 2)
	byTitle := map[string]int64{}
	for _, todo := range roots {
		byTitle[todo.Title] = todo.ChildCount
	}
	assert.Equal(t, map[string]int64{"root": 1, "standalone": 0}, byTitle, "child_count = live direct children")

	// Parent filter: direct children of root, grandchildren excluded.
	children, total, err := repo.List(ctx, 1, model.TodoListQuery{ParentID: &root.ID})
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, children, 1)
	assert.Equal(t, "child", children[0].Title)
	assert.Equal(t, int64(1), children[0].ChildCount, "grandchild counted on its parent")
}

// --- Reorder renumbers the workspace ---

func TestTodoRepo_Reorder(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	a := mustCreateTodo(t, repo, 1, "a")
	mustCreateTodo(t, repo, 1, "b")
	c := mustCreateTodo(t, repo, 1, "c")
	mustCreateTodo(t, repo, 2, "other-ws") // must be untouched

	// Move c to right after a → [a, c, b]
	require.NoError(t, repo.Reorder(ctx, 1, c.ID, &a.ID))

	todos, _, err := repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortManual})
	require.NoError(t, err)
	require.Len(t, todos, 3)
	assert.Equal(t, []string{"a", "c", "b"}, []string{todos[0].Title, todos[1].Title, todos[2].Title})

	// Move a to the top → [a, c, b] (already first, idempotent check it stays valid)
	require.NoError(t, repo.Reorder(ctx, 1, a.ID, nil))
	todos, _, _ = repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortManual})
	assert.Equal(t, "a", todos[0].Title)
}

func TestTodoRepo_ReorderItem(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	todo := mustCreateTodo(t, repo, 1, "parent")
	a := &model.TodoItem{TodoID: todo.ID, Content: "a"}
	b := &model.TodoItem{TodoID: todo.ID, Content: "b"}
	c := &model.TodoItem{TodoID: todo.ID, Content: "c"}
	require.NoError(t, repo.CreateItem(ctx, a))
	require.NoError(t, repo.CreateItem(ctx, b))
	require.NoError(t, repo.CreateItem(ctx, c))

	// Move c to the top → [c, a, b]
	require.NoError(t, repo.ReorderItem(ctx, todo.ID, c.ID, nil))
	items, err := repo.ListItems(ctx, todo.ID)
	require.NoError(t, err)
	require.Len(t, items, 3)
	assert.Equal(t, []string{"c", "a", "b"}, []string{items[0].Content, items[1].Content, items[2].Content})
}

// --- PromoteItem creates a todo, copies tags, and adjusts parent counts ---

func TestTodoRepo_PromoteItem(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	tag := &model.Tag{UserID: 1, WorkspaceID: 1, Name: "work", Color: "#3b82f6"}
	require.NoError(t, db.Create(tag).Error)

	todo := mustCreateTodo(t, repo, 1, "parent")
	require.NoError(t, repo.ReplaceTags(ctx, todo.ID, []model.Tag{*tag}))
	item := &model.TodoItem{TodoID: todo.ID, Content: "step", Done: true}
	require.NoError(t, repo.CreateItem(ctx, item))

	promoted, err := repo.PromoteItem(ctx, 1, 1, todo.ID, item.ID)
	require.NoError(t, err)
	assert.Equal(t, "step", promoted.Title)
	assert.Equal(t, "done", promoted.Status, "done item promotes into a done todo")
	assert.NotNil(t, promoted.CompletedAt)

	// Parent lost the item.
	parent, _ := repo.GetByID(ctx, 1, todo.ID)
	assert.Equal(t, 0, parent.ItemTotal)

	// Promoted todo exists at the top level and inherited the tag.
	todos, total, err := repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortCreated})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	var fresh *model.Todo
	for i := range todos {
		if todos[i].ID == promoted.ID {
			fresh = &todos[i]
		}
	}
	require.NotNil(t, fresh)
	require.Len(t, fresh.Tags, 1)
	assert.Equal(t, "work", fresh.Tags[0].Name)

	// Source item is gone.
	items, _ := repo.ListItems(ctx, todo.ID)
	assert.Empty(t, items)
}

// --- Duplicate copies fields, items (with counts) and tags ---

func TestTodoRepo_Duplicate(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	tag := &model.Tag{UserID: 1, WorkspaceID: 1, Name: "work"}
	require.NoError(t, db.Create(tag).Error)

	src := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "original", Status: "done", Priority: "high", Color: "#ff0000"}
	require.NoError(t, repo.Create(ctx, src))
	require.NoError(t, repo.ReplaceTags(ctx, src.ID, []model.Tag{*tag}))
	require.NoError(t, repo.CreateItem(ctx, &model.TodoItem{TodoID: src.ID, Content: "a", Done: false}))
	require.NoError(t, repo.CreateItem(ctx, &model.TodoItem{TodoID: src.ID, Content: "b", Done: true}))

	clone, err := repo.Duplicate(ctx, 1, 1, src.ID)
	require.NoError(t, err)
	assert.Equal(t, "original", clone.Title)
	assert.Equal(t, "pending", clone.Status, "completion resets on duplicate")
	assert.Equal(t, "high", clone.Priority)
	assert.Equal(t, "#ff0000", clone.Color)
	assert.Equal(t, 2, clone.ItemTotal)
	assert.Equal(t, 1, clone.ItemDone, "done state of copied items is preserved")

	items, err := repo.ListItems(ctx, clone.ID)
	require.NoError(t, err)
	assert.Len(t, items, 2)

	tags, err := repo.GetTags(ctx, clone.ID)
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, "work", tags[0].Name)
}

// --- BulkAction complete/delete ---

func TestTodoRepo_BulkAction(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	a := mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")
	c := mustCreateTodo(t, repo, 1, "c")

	affected, err := repo.BulkAction(ctx, 1, []uint{a.ID, b.ID}, "complete")
	require.NoError(t, err)
	assert.Equal(t, int64(2), affected)

	done, _, err := repo.List(ctx, 1, model.TodoListQuery{Status: "done"})
	require.NoError(t, err)
	assert.Len(t, done, 2)

	affected, err = repo.BulkAction(ctx, 1, []uint{c.ID}, "delete")
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)

	_, total, err := repo.List(ctx, 1, model.TodoListQuery{})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total, "deleted todo is excluded from list")

	affected, err = repo.BulkAction(ctx, 1, nil, "complete")
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected)
}

func TestTodoRepo_BulkComplete_RecurringAdvances(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	past := time.Now().Add(-48 * time.Hour)
	rec := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "standup", Status: "pending", Repeat: "daily", DueTime: &past}
	require.NoError(t, repo.Create(ctx, rec))
	plain := mustCreateTodo(t, repo, 1, "one-off")

	affected, err := repo.BulkAction(ctx, 1, []uint{rec.ID, plain.ID}, "complete")
	require.NoError(t, err)
	assert.Equal(t, int64(2), affected)

	// Recurring task advanced (still pending); plain task marked done.
	loadedRec, err := repo.GetByID(ctx, 1, rec.ID)
	require.NoError(t, err)
	assert.Equal(t, "pending", loadedRec.Status)
	assert.True(t, loadedRec.DueTime.After(past), "recurring due advanced on bulk complete")

	loadedPlain, _ := repo.GetByID(ctx, 1, plain.ID)
	assert.Equal(t, "done", loadedPlain.Status)
}

func TestTodoRepo_UpdateItem_DueAndSortOrder(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	todo := mustCreateTodo(t, repo, 1, "parent")

	aItem := &model.TodoItem{TodoID: todo.ID, Content: "a"}
	require.NoError(t, repo.CreateItem(ctx, aItem))
	bItem := &model.TodoItem{TodoID: todo.ID, Content: "b"}
	require.NoError(t, repo.CreateItem(ctx, bItem))
	cItem := &model.TodoItem{TodoID: todo.ID, Content: "c"}
	require.NoError(t, repo.CreateItem(ctx, cItem))

	// Reorder to c, a, b so a has a non-zero sort_order.
	require.NoError(t, repo.ReorderItem(ctx, todo.ID, cItem.ID, nil))

	// Editing a's content must NOT reset its sort_order (regression for a prior bug).
	require.NoError(t, repo.UpdateItem(ctx, todo.ID, &model.TodoItem{ID: aItem.ID, TodoID: todo.ID, Content: "a-edited"}))
	items, err := repo.ListItems(ctx, todo.ID)
	require.NoError(t, err)
	require.Len(t, items, 3)
	assert.Equal(t, []string{"c", "a-edited", "b"}, []string{items[0].Content, items[1].Content, items[2].Content})

	// Setting a due time persists.
	due := time.Now().Add(24 * time.Hour)
	require.NoError(t, repo.UpdateItem(ctx, todo.ID, &model.TodoItem{ID: cItem.ID, TodoID: todo.ID, Content: "c", DueTime: &due}))
	items, _ = repo.ListItems(ctx, todo.ID)
	var cReloaded *model.TodoItem
	for i := range items {
		if items[i].ID == cItem.ID {
			cReloaded = &items[i]
		}
	}
	require.NotNil(t, cReloaded)
	require.NotNil(t, cReloaded.DueTime, "item due time persisted")
}

func TestTodoRepo_StartedFilter(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	// A deferred task (starts in the future) and an immediately-actionable one.
	future := time.Now().Add(48 * time.Hour)
	deferred := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "later", Status: "pending", StartTime: &future}
	require.NoError(t, repo.Create(ctx, deferred))
	mustCreateTodo(t, repo, 1, "now")

	// Started filter hides the deferred task.
	todos, total, err := repo.List(ctx, 1, model.TodoListQuery{Started: true})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, todos, 1)
	assert.Equal(t, "now", todos[0].Title)

	// Without the filter both are visible.
	_, total, _ = repo.List(ctx, 1, model.TodoListQuery{})
	assert.Equal(t, int64(2), total)
}

// --- Stats counts ---

func TestTodoRepo_Stats(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	past := time.Now().Add(-24 * time.Hour)
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "overdue", Status: "pending", DueTime: &past}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "pending", Status: "pending"}))
	future := time.Now().Add(48 * time.Hour)
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "deferred", Status: "pending", StartTime: &future}))
	now := time.Now()
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "done", Status: "done", CompletedAt: &now}))

	stats, err := repo.Stats(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(4), stats.Total)
	assert.Equal(t, int64(3), stats.Pending)
	assert.Equal(t, int64(1), stats.Overdue)
	assert.Equal(t, int64(1), stats.Deferred)
	assert.GreaterOrEqual(t, stats.DoneToday, int64(1))
	assert.GreaterOrEqual(t, stats.DoneThisWeek, int64(1))
}

// --- List filtering & ordering ---

func TestTodoRepo_List_FilterAndOrder(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "Buy milk", Status: "pending", Priority: "high"}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "Write tests", Status: "pending", Priority: "low"}))

	// search
	todos, total, err := repo.List(ctx, 1, model.TodoListQuery{Search: "milk"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "Buy milk", todos[0].Title)

	// priority filter excludes others
	_, total, err = repo.List(ctx, 1, model.TodoListQuery{Priority: "low"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)

	// priority sort puts high first
	todos, _, err = repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortPriority})
	require.NoError(t, err)
	require.Len(t, todos, 2)
	assert.Equal(t, "high", todos[0].Priority)
}

// --- Pin (star) floats a todo to the top of every sort ---

func TestTodoRepo_PinSortsFirst(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	mustCreateTodo(t, repo, 1, "a")
	b := mustCreateTodo(t, repo, 1, "b")

	// Pin b; it should now sort before a under the default (due date) ordering.
	require.NoError(t, repo.SetPinned(ctx, 1, b.ID, true))

	loaded, err := repo.GetByID(ctx, 1, b.ID)
	require.NoError(t, err)
	assert.True(t, loaded.Pinned)

	todos, _, err := repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortCreated})
	require.NoError(t, err)
	require.Len(t, todos, 2)
	assert.Equal(t, "b", todos[0].Title, "pinned todo sorts first")

	// Unpin restores the natural created-asc order (a then b).
	require.NoError(t, repo.SetPinned(ctx, 1, b.ID, false))
	todos, _, _ = repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortCreated})
	assert.Equal(t, "a", todos[0].Title, "older created todo first after unpin")
}

// --- Trash (soft-delete) list + restore ---

func TestTodoRepo_TrashAndRestore(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	todo := mustCreateTodo(t, repo, 1, "doomed")

	require.NoError(t, repo.Delete(ctx, 1, todo.ID))

	// Appears in trash, hidden from the normal list.
	trash, err := repo.ListTrash(ctx, 1)
	require.NoError(t, err)
	require.Len(t, trash, 1)
	assert.Equal(t, todo.ID, trash[0].ID)
	_, total, _ := repo.List(ctx, 1, model.TodoListQuery{})
	assert.Equal(t, int64(0), total)

	// Restore brings it back.
	require.NoError(t, repo.Restore(ctx, 1, todo.ID))
	trash, _ = repo.ListTrash(ctx, 1)
	assert.Empty(t, trash)
	_, total, _ = repo.List(ctx, 1, model.TodoListQuery{})
	assert.Equal(t, int64(1), total)

	// Restoring a non-deleted todo is a not-found.
	err = repo.Restore(ctx, 1, todo.ID)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

// TestTodoRepo_CascadeDeleteRestore_DeepTree exercises multi-level (3-deep)
// cascade in both Delete and Restore, plus workspace scoping: a todo in another
// workspace whose parent_id happens to point at the deleted root must be
// untouched. This locks in the recursive-CTE traversal across more than one hop.
func TestTodoRepo_CascadeDeleteRestore_DeepTree(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	root := mustCreateTodo(t, repo, 1, "root")
	child := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "child", Status: "pending", Priority: "normal", ParentID: &root.ID}
	require.NoError(t, repo.Create(ctx, child))
	grand := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "grand", Status: "pending", Priority: "normal", ParentID: &child.ID}
	require.NoError(t, repo.Create(ctx, grand))
	// Unrelated top-level todo in the same workspace must NOT be cascaded.
	mustCreateTodo(t, repo, 1, "other")
	// A child in another workspace whose parent_id collides with root must be
	// untouched (cascade is scoped by workspace_id).
	ws2root := mustCreateTodo(t, repo, 2, "ws2root")
	ws2child := &model.Todo{UserID: 1, WorkspaceID: 2, Title: "ws2child", Status: "pending", Priority: "normal", ParentID: &root.ID}
	require.NoError(t, repo.Create(ctx, ws2child))
	_ = ws2root

	// Delete the root → entire 3-level subtree lands in trash.
	require.NoError(t, repo.Delete(ctx, 1, root.ID))
	trash, err := repo.ListTrash(ctx, 1)
	require.NoError(t, err)
	assert.Len(t, trash, 3, "root + child + grandchild cascaded to trash")
	_, total, _ := repo.List(ctx, 1, model.TodoListQuery{})
	assert.Equal(t, int64(1), total, "only the unrelated todo stays active in workspace 1")
	_, ws2total, _ := repo.List(ctx, 2, model.TodoListQuery{})
	assert.Equal(t, int64(2), ws2total, "workspace 2 untouched by workspace 1 cascade")

	// Restore the root → entire subtree comes back together.
	require.NoError(t, repo.Restore(ctx, 1, root.ID))
	trash, _ = repo.ListTrash(ctx, 1)
	assert.Empty(t, trash, "subtree fully restored")
	_, total, _ = repo.List(ctx, 1, model.TodoListQuery{})
	assert.Equal(t, int64(4), total, "root + child + grand + other all active again")
}


