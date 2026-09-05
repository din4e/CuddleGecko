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
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.TodoActivity{}, &model.Tag{}))
	return db
}

func mustCreateTodo(t *testing.T, repo *TodoRepo, ws uint, title string) *model.Todo {
	t.Helper()
	todo := &model.Todo{UserID: 1, WorkspaceID: ws, Title: title, Status: "pending", Priority: "normal"}
	require.NoError(t, repo.Create(context.Background(), todo))
	return todo
}

// --- Trash purge ---

func TestTodoRepo_EmptyTrash(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	// ws 1: one trashed todo (with an item, an activity line and a tag link)
	// plus one live todo; ws 2: one trashed todo that must survive.
	trashed := mustCreateTodo(t, repo, 1, "trashed")
	live := mustCreateTodo(t, repo, 1, "live")
	otherWs := mustCreateTodo(t, repo, 2, "other workspace")
	item := &model.TodoItem{TodoID: trashed.ID, Content: "sub-item"}
	require.NoError(t, repo.CreateItem(ctx, item))
	activity := &model.TodoActivity{TodoID: trashed.ID, UserID: 1, Username: "u", Action: model.TodoActivityCreated}
	require.NoError(t, db.Create(activity).Error)
	tag := &model.Tag{UserID: 1, WorkspaceID: 1, Name: "t", Color: "#111111"}
	require.NoError(t, db.Create(tag).Error)
	require.NoError(t, db.Exec("INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)", trashed.ID, tag.ID).Error)

	require.NoError(t, repo.Delete(ctx, 1, trashed.ID))
	require.NoError(t, repo.Delete(ctx, 2, otherWs.ID))

	count, err := repo.EmptyTrash(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), count, "only ws 1's trashed todo is purged")

	var ws1Rows, ws2Rows int64
	db.Unscoped().Model(&model.Todo{}).Where("workspace_id = ?", 1).Count(&ws1Rows)
	db.Unscoped().Model(&model.Todo{}).Where("workspace_id = ?", 2).Count(&ws2Rows)
	assert.Equal(t, int64(1), ws1Rows, "the live todo stays, the trashed row is hard-gone")
	assert.Equal(t, int64(1), ws2Rows, "other workspaces' trash is untouched")

	var items, activities, tagLinks int64
	db.Unscoped().Model(&model.TodoItem{}).Where("todo_id = ?", trashed.ID).Count(&items)
	db.Model(&model.TodoActivity{}).Where("todo_id = ?", trashed.ID).Count(&activities)
	db.Raw("SELECT COUNT(*) FROM todo_tags WHERE todo_id = ?", trashed.ID).Scan(&tagLinks)
	assert.Equal(t, int64(0), items, "purged todo's checklist items go with it")
	assert.Equal(t, int64(0), activities, "purged todo's audit trail goes with it")
	assert.Equal(t, int64(0), tagLinks, "purged todo's tag associations go with it")

	// The live todo keeps its rows.
	var liveItems int64
	db.Unscoped().Model(&model.TodoItem{}).Where("todo_id = ?", live.ID).Count(&liveItems)
	assert.Equal(t, int64(0), liveItems) // none created — sanity only

	// Emptying an already-empty trash is a no-op.
	count, err = repo.EmptyTrash(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(0), count)
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

// A child restored alone from the trash (its parent still soft-deleted) must
// surface as a root — otherwise it matches neither the roots query nor any
// parent's children query and silently disappears from the lazy tree.
func TestTodoRepo_List_OrphanedChildSurfacesAsRoot(t *testing.T) {
	repo := NewTodoRepo(newTodoTestDB(t))
	ctx := context.Background()

	parent := mustCreateTodo(t, repo, 1, "parent")
	child := mustCreateTodo(t, repo, 1, "child")
	require.NoError(t, repo.SetParent(ctx, 1, child.ID, &parent.ID))
	// Cascade-delete both, then restore only the child.
	require.NoError(t, repo.Delete(ctx, 1, parent.ID))
	require.NoError(t, repo.Restore(ctx, 1, child.ID))

	roots, total, err := repo.List(ctx, 1, model.TodoListQuery{RootsOnly: true})
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, roots, 1)
	assert.Equal(t, "child", roots[0].Title)
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

// --- Cascade complete/restore: parent completion sweeps its subtree ---

func TestTodoRepo_CascadeCompleteAndRestore(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	parent := mustCreateTodo(t, repo, 1, "parent")
	pendingChild := mustCreateTodo(t, repo, 1, "pending-child")
	require.NoError(t, repo.SetParent(ctx, 1, pendingChild.ID, &parent.ID))
	abandonedChild := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "abandoned-child", Status: "abandoned", ParentID: &parent.ID}
	require.NoError(t, repo.Create(ctx, abandonedChild))
	doneAt := time.Now().Add(-time.Hour)
	doneChild := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "done-child", Status: "done", CompletedAt: &doneAt, ParentID: &parent.ID}
	require.NoError(t, repo.Create(ctx, doneChild))
	due := time.Now().Add(24 * time.Hour)
	recurringChild := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "recurring-child", Status: "pending", Repeat: "daily", DueTime: &due, ParentID: &parent.ID}
	require.NoError(t, repo.Create(ctx, recurringChild))
	grandchild := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "grandchild", Status: "pending", ParentID: &pendingChild.ID}
	require.NoError(t, repo.Create(ctx, grandchild))

	// Completing the parent cascades to the whole subtree...
	n, err := repo.CascadeComplete(ctx, 1, []uint{parent.ID}, time.Now())
	require.NoError(t, err)
	assert.Equal(t, int64(3), n, "pending + abandoned + grandchild flip; the already-done child does not")

	pendingLoaded, err := repo.GetByID(ctx, 1, pendingChild.ID)
	require.NoError(t, err)
	assert.Equal(t, "done", pendingLoaded.Status)
	require.NotNil(t, pendingLoaded.StatusBeforeCascade)
	assert.Equal(t, "pending", *pendingLoaded.StatusBeforeCascade)
	assert.NotNil(t, pendingLoaded.CompletedAt)

	abandonedLoaded, _ := repo.GetByID(ctx, 1, abandonedChild.ID)
	assert.Equal(t, "done", abandonedLoaded.Status)
	require.NotNil(t, abandonedLoaded.StatusBeforeCascade)
	assert.Equal(t, "abandoned", *abandonedLoaded.StatusBeforeCascade)

	doneLoaded, _ := repo.GetByID(ctx, 1, doneChild.ID)
	assert.Equal(t, "done", doneLoaded.Status)
	assert.Nil(t, doneLoaded.StatusBeforeCascade, "already-done rows keep no snapshot")
	assert.Equal(t, doneAt.Unix(), doneLoaded.CompletedAt.Unix(), "done rows keep their own completion time")

	recurringLoaded, _ := repo.GetByID(ctx, 1, recurringChild.ID)
	assert.Equal(t, "pending", recurringLoaded.Status, "recurring descendants keep their own schedule")

	grandLoaded, _ := repo.GetByID(ctx, 1, grandchild.ID)
	assert.Equal(t, "done", grandLoaded.Status, "cascade reaches nested depth")

	// The user directly reopens one child while the parent is done: its
	// snapshot is cleared and a later parent reopen must not touch it.
	pendingLoaded.Status = "pending"
	pendingLoaded.CompletedAt = nil
	pendingLoaded.StatusBeforeCascade = nil
	require.NoError(t, repo.Update(ctx, pendingLoaded))

	// Reopening the parent restores the snapshotted statuses verbatim...
	n, err = repo.CascadeRestore(ctx, 1, []uint{parent.ID})
	require.NoError(t, err)
	assert.Equal(t, int64(2), n, "abandoned child + grandchild restore; the manually reopened child stays")

	abandonedLoaded, _ = repo.GetByID(ctx, 1, abandonedChild.ID)
	assert.Equal(t, "abandoned", abandonedLoaded.Status)
	assert.Nil(t, abandonedLoaded.StatusBeforeCascade)
	assert.Nil(t, abandonedLoaded.CompletedAt)

	grandLoaded, _ = repo.GetByID(ctx, 1, grandchild.ID)
	assert.Equal(t, "pending", grandLoaded.Status)
	assert.Nil(t, grandLoaded.StatusBeforeCascade)

	pendingLoaded, _ = repo.GetByID(ctx, 1, pendingChild.ID)
	assert.Equal(t, "pending", pendingLoaded.Status, "manual status wins over the parent reopen")

	doneLoaded, _ = repo.GetByID(ctx, 1, doneChild.ID)
	assert.Equal(t, "done", doneLoaded.Status, "already-done child is untouched by the restore")
}

// --- Deferred / done-after filters (stat-click smart lists) ---

func TestTodoRepo_DeferredFilter(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	future := time.Now().Add(48 * time.Hour)
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "deferred", Status: "pending", StartTime: &future}))
	mustCreateTodo(t, repo, 1, "now")
	// A done task with a future start_time is settled, not deferred — mirrors
	// the stats bucket (pending AND future start).
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "done", Status: "done", StartTime: &future}))

	todos, total, err := repo.List(ctx, 1, model.TodoListQuery{Deferred: true})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, todos, 1)
	assert.Equal(t, "deferred", todos[0].Title)
}

func TestTodoRepo_DoneAfterFilter(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	now := time.Now()
	lastWeek := now.AddDate(0, 0, -7)
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "today", Status: "done", CompletedAt: &now}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "last-week", Status: "done", CompletedAt: &lastWeek}))
	mustCreateTodo(t, repo, 1, "open")

	// Boundary an hour ago: only the recent completion matches (paired with
	// status=done by the caller, like the done-today smart list).
	hourAgo := now.Add(-time.Hour)
	todos, total, err := repo.List(ctx, 1, model.TodoListQuery{Status: "done", DoneAfter: &hourAgo})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, todos, 1)
	assert.Equal(t, "today", todos[0].Title)
}

func TestTodoRepo_List_TagFilterAny(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	urgent := model.Tag{UserID: 1, WorkspaceID: 1, Name: "urgent", Color: "#ff0000"}
	home := model.Tag{UserID: 1, WorkspaceID: 1, Name: "home", Color: "#00ff00"}
	require.NoError(t, db.Create(&urgent).Error)
	require.NoError(t, db.Create(&home).Error)

	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "a", Status: "pending", Priority: "normal", Tags: []model.Tag{urgent}}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "b", Status: "pending", Priority: "normal", Tags: []model.Tag{home}}))
	mustCreateTodo(t, repo, 1, "untagged")

	// Multi-tag filter is ANY-of (OR): todos tagged with either label match.
	_, total, err := repo.List(ctx, 1, model.TodoListQuery{TagIDs: []uint{urgent.ID, home.ID}})
	require.NoError(t, err)
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



// --- Four priority tiers: 高 > 中 > 低 > 无 ---

func TestTodoRepo_PriorityRankSortsNoneLast(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()

	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "low", Status: "pending", Priority: "low"}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "high", Status: "pending", Priority: "high"}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "none", Status: "pending", Priority: "none"}))
	require.NoError(t, repo.Create(ctx, &model.Todo{UserID: 1, WorkspaceID: 1, Title: "normal", Status: "pending", Priority: "normal"}))

	todos, _, err := repo.List(ctx, 1, model.TodoListQuery{Sort: model.TodoSortPriority})
	require.NoError(t, err)
	require.Len(t, todos, 4)
	got := []string{todos[0].Title, todos[1].Title, todos[2].Title, todos[3].Title}
	assert.Equal(t, []string{"high", "normal", "low", "none"}, got)

	// The none tier is also filterable.
	todos, total, err := repo.List(ctx, 1, model.TodoListQuery{Priority: "none"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, todos, 1)
	assert.Equal(t, "none", todos[0].Priority)
}
