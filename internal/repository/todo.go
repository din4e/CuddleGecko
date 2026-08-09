package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// Nesting-related validation errors. Returned by Move so the handler can map
// them to 4xx without the service needing repo internals.
var (
	ErrTodoSelfParent    = errors.New("a todo cannot be its own parent")
	ErrTodoInvalidParent = errors.New("parent todo not found in this workspace")
	ErrTodoCycle         = errors.New("cannot move a todo under itself or one of its descendants")
)

type TodoRepo struct {
	db *gorm.DB
}

func NewTodoRepo(db *gorm.DB) *TodoRepo {
	return &TodoRepo{db: db}
}

func (r *TodoRepo) Create(ctx context.Context, todo *model.Todo) error {
	if err := r.db.WithContext(ctx).Create(todo).Error; err != nil {
		return fmt.Errorf("create todo: %w", err)
	}
	return nil
}

func (r *TodoRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error) {
	var todo model.Todo
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&todo).Error; err != nil {
		return nil, err
	}
	return &todo, nil
}

func (r *TodoRepo) List(ctx context.Context, workspaceID uint, q model.TodoListQuery) ([]model.Todo, int64, error) {
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.PageSize <= 0 {
		q.PageSize = 50
	}

	query := r.db.WithContext(ctx).Model(&model.Todo{}).Where("workspace_id = ?", workspaceID)

	if q.Status != "" {
		query = query.Where("status = ?", q.Status)
	}
	if q.Priority != "" {
		query = query.Where("priority = ?", q.Priority)
	}
	if q.Search != "" {
		// LIKE matching is case-insensitive under MySQL's default collation;
		// wrap with LOWER so SQLite-backed tests also match case-insensitively.
		query = query.Where("LOWER(title) LIKE ?", "%"+strings.ToLower(q.Search)+"%")
	}
	if q.DueAfter != nil {
		query = query.Where("due_time >= ?", *q.DueAfter)
	}
	if q.DueBefore != nil {
		query = query.Where("due_time <= ?", *q.DueBefore)
	}
	if q.Overdue {
		now := time.Now()
		query = query.Where("status = ? AND due_time IS NOT NULL AND due_time < ?", "pending", now)
	}
	if q.Started {
		// Hide deferred tasks: a task with a future start_time isn't actionable yet.
		now := time.Now()
		query = query.Where("start_time IS NULL OR start_time <= ?", now)
	}
	if len(q.TagIDs) > 0 {
		// Subquery (instead of JOIN) keeps the count correct even when a todo
		// matches more than one of the requested tags.
		query = query.Where("id IN (SELECT todo_id FROM todo_tags WHERE tag_id IN ?)", q.TagIDs)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count todos: %w", err)
	}

	var todos []model.Todo
	offset := (q.Page - 1) * q.PageSize
	if err := query.Order(todoOrderClause(q.Sort, q.Order)).Preload("Tags").
		Limit(q.PageSize).Offset(offset).
		Find(&todos).Error; err != nil {
		return nil, 0, fmt.Errorf("list todos: %w", err)
	}
	return todos, total, nil
}

// todoOrderClause builds the ORDER BY clause for the requested sort key.
// Pending tasks always surface before done ones, and priority acts as a
// secondary tiebreaker — mirroring TickTick's default task ordering.
func todoOrderClause(sort, order string) string {
	dir := "ASC"
	if strings.EqualFold(order, "desc") {
		dir = "DESC"
	}

	const (
		pendingFirst  = "CASE WHEN status = 'done' THEN 1 ELSE 0 END"
		pinnedFirst   = "CASE WHEN pinned THEN 0 ELSE 1 END"
		priorityRank  = "CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 3 END"
		dueNullsLast  = "due_time IS NULL"
		createdTie    = "created_at DESC"
	)

	switch sort {
	case model.TodoSortManual:
		// Manual ordering respects the user's explicit sort_order exactly.
		return pinnedFirst + ", sort_order ASC, id ASC"
	case model.TodoSortPriority:
		return pinnedFirst + ", " + pendingFirst + ", " + priorityRank + " ASC, " + dueNullsLast + ", due_time ASC, " + createdTie
	case model.TodoSortTitle:
		return pinnedFirst + ", " + pendingFirst + ", title " + dir + ", " + createdTie
	case model.TodoSortCreated:
		return pinnedFirst + ", " + pendingFirst + ", created_at " + dir
	default: // model.TodoSortDueDate
		return pinnedFirst + ", " + pendingFirst + ", " + dueNullsLast + ", due_time " + dir + ", " + priorityRank + " ASC, " + createdTie
	}
}

func (r *TodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	if err := r.db.WithContext(ctx).Model(&model.Todo{ID: todo.ID}).
		Select("title", "description", "status", "priority", "due_time", "start_time", "amount", "amount_type", "contact_ids", "color", "repeat", "repeat_interval", "completed_at").
		Updates(todo).Error; err != nil {
		return fmt.Errorf("update todo: %w", err)
	}
	return nil
}

// Delete soft-deletes a todo AND all of its descendants (BFS along parent_id),
// so removing a parent doesn't leave orphaned children. Everything lands in the
// trash together and can be restored from there.
func (r *TodoRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Load the (non-deleted) parent graph for the workspace.
		var nodes []model.Todo
		if err := tx.Where("workspace_id = ?", workspaceID).
			Select("id, parent_id").Find(&nodes).Error; err != nil {
			return fmt.Errorf("load todo graph for cascade delete: %w", err)
		}
		children := make(map[uint][]uint)
		for _, n := range nodes {
			if n.ParentID != nil {
				children[*n.ParentID] = append(children[*n.ParentID], n.ID)
			}
		}
		// BFS descendants of id (inclusive).
		var ids []uint
		seen := map[uint]bool{}
		queue := []uint{id}
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			if seen[cur] {
				continue
			}
			seen[cur] = true
			ids = append(ids, cur)
			queue = append(queue, children[cur]...)
		}
		if err := tx.Where("id IN ? AND workspace_id = ?", ids, workspaceID).
			Delete(&model.Todo{}).Error; err != nil {
			return fmt.Errorf("cascade delete todos: %w", err)
		}
		return nil
	})
}

// Reorder moves the todo to appear immediately after afterID (or to the top when
// afterID is nil) within the workspace's manual order. The whole list is
// renumbered inside a transaction so the order stays consistent.
func (r *TodoRepo) Reorder(ctx context.Context, workspaceID, id uint, afterID *uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var all []model.Todo
		if err := tx.Where("workspace_id = ?", workspaceID).
			Order("sort_order ASC, id ASC").Find(&all).Error; err != nil {
			return fmt.Errorf("load todos for reorder: %w", err)
		}

		// Remove the moved todo.
		movedIdx := -1
		rest := make([]model.Todo, 0, len(all))
		for i, t := range all {
			if t.ID == id {
				movedIdx = i
				continue
			}
			rest = append(rest, t)
		}
		if movedIdx == -1 {
			return nil // nothing to move
		}

		// Find the insertion point: right after afterID, or the top.
		insertAt := 0
		if afterID != nil {
			for i, t := range rest {
				if t.ID == *afterID {
					insertAt = i + 1
					break
				}
			}
		}

		ordered := make([]model.Todo, 0, len(rest)+1)
		ordered = append(ordered, rest[:insertAt]...)
		ordered = append(ordered, all[movedIdx])
		ordered = append(ordered, rest[insertAt:]...)

		for i, t := range ordered {
			if err := tx.Model(&model.Todo{}).Where("id = ?", t.ID).
				Update("sort_order", i).Error; err != nil {
				return fmt.Errorf("renumber todo order: %w", err)
			}
		}
		return nil
	})
}

// Move reparents a todo (parent_id; nil = root) and reorders it to appear right
// after afterID among its (new) siblings. Parent existence and cycle safety
// (can't move under itself or a descendant) are validated inside the same
// transaction; sibling sort_order is renumbered per parent group.
func (r *TodoRepo) Move(ctx context.Context, workspaceID, id uint, parentID, afterID *uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1. The moved todo must exist in the workspace.
		var moved model.Todo
		if err := tx.Where("id = ? AND workspace_id = ?", id, workspaceID).First(&moved).Error; err != nil {
			return err
		}

		// 2. Validate the target parent.
		if parentID != nil {
			if *parentID == id {
				return ErrTodoSelfParent
			}
			var parent model.Todo
			if err := tx.Where("id = ? AND workspace_id = ?", *parentID, workspaceID).First(&parent).Error; err != nil {
				return ErrTodoInvalidParent
			}
			// Cycle check: walk the candidate parent's ancestor chain; if we hit
			// `id`, the candidate is a descendant of the moved todo.
			cur := parent.ParentID
			for cur != nil {
				if *cur == id {
					return ErrTodoCycle
				}
				var anc model.Todo
				if err := tx.Select("parent_id").Where("id = ?", *cur).First(&anc).Error; err != nil {
					break
				}
				cur = anc.ParentID
			}
		}

		// 3. Reparent (map form so a nil parent_id is written as NULL).
		if err := tx.Model(&model.Todo{}).Where("id = ?", id).
			Updates(map[string]interface{}{"parent_id": parentID}).Error; err != nil {
			return fmt.Errorf("move todo: %w", err)
		}

		// 4. Renumber siblings under the (new) parent so order stays consistent.
		sib := tx.Model(&model.Todo{}).Where("workspace_id = ? AND id <> ?", workspaceID, id)
		if parentID == nil {
			sib = sib.Where("parent_id IS NULL")
		} else {
			sib = sib.Where("parent_id = ?", *parentID)
		}
		var siblings []model.Todo
		if err := sib.Order("sort_order ASC, id ASC").Find(&siblings).Error; err != nil {
			return fmt.Errorf("load siblings for move: %w", err)
		}

		insertAt := 0
		if afterID != nil {
			for i, s := range siblings {
				if s.ID == *afterID {
					insertAt = i + 1
					break
				}
			}
		}
		ordered := make([]model.Todo, 0, len(siblings)+1)
		ordered = append(ordered, siblings[:insertAt]...)
		ordered = append(ordered, model.Todo{ID: id})
		ordered = append(ordered, siblings[insertAt:]...)
		for i, t := range ordered {
			if err := tx.Model(&model.Todo{}).Where("id = ?", t.ID).
				Update("sort_order", i).Error; err != nil {
				return fmt.Errorf("renumber siblings after move: %w", err)
			}
		}
		return nil
	})
}

// Stats computes a productivity overview. Each count uses a fresh query so the
// differing WHERE clauses don't accumulate.
func (r *TodoRepo) Stats(ctx context.Context, workspaceID uint) (model.TodoStats, error) {
	now := time.Now()
	startToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	daysSinceMonday := int(now.Weekday()) - int(time.Monday)
	if daysSinceMonday < 0 {
		daysSinceMonday += 7
	}
	startWeek := startToday.AddDate(0, 0, -daysSinceMonday)

	// base returns a fresh query scoped to the workspace.
	base := func() *gorm.DB {
		return r.db.WithContext(ctx).Model(&model.Todo{}).Where("workspace_id = ?", workspaceID)
	}

	count := func(query *gorm.DB) (int64, error) {
		var n int64
		if err := query.Count(&n).Error; err != nil {
			return 0, fmt.Errorf("stat count: %w", err)
		}
		return n, nil
	}

	var stats model.TodoStats
	var err error
	if stats.Total, err = count(base()); err != nil {
		return stats, err
	}
	if stats.Pending, err = count(base().Where("status = ?", "pending")); err != nil {
		return stats, err
	}
	if stats.Overdue, err = count(base().Where("status = ? AND due_time IS NOT NULL AND due_time < ?", "pending", now)); err != nil {
		return stats, err
	}
	if stats.Deferred, err = count(base().Where("status = ? AND start_time IS NOT NULL AND start_time > ?", "pending", now)); err != nil {
		return stats, err
	}
	if stats.DoneToday, err = count(base().Where("status = ? AND completed_at >= ?", "done", startToday)); err != nil {
		return stats, err
	}
	if stats.DoneThisWeek, err = count(base().Where("status = ? AND completed_at >= ?", "done", startWeek)); err != nil {
		return stats, err
	}
	return stats, nil
}

// --- Tag associations ---

func (r *TodoRepo) ReplaceTags(ctx context.Context, todoID uint, tags []model.Tag) error {
	todo := model.Todo{ID: todoID}
	if err := r.db.WithContext(ctx).Model(&todo).Association("Tags").Replace(tags); err != nil {
		return fmt.Errorf("replace todo tags: %w", err)
	}
	return nil
}

func (r *TodoRepo) GetTags(ctx context.Context, todoID uint) ([]model.Tag, error) {
	var tags []model.Tag
	todo := model.Todo{ID: todoID}
	if err := r.db.WithContext(ctx).Model(&todo).Association("Tags").Find(&tags); err != nil {
		return nil, fmt.Errorf("get todo tags: %w", err)
	}
	return tags, nil
}

// --- Checklist (subtask) operations ---

func (r *TodoRepo) ListItems(ctx context.Context, todoID uint) ([]model.TodoItem, error) {
	var items []model.TodoItem
	if err := r.db.WithContext(ctx).Where("todo_id = ?", todoID).
		Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list todo items: %w", err)
	}
	return items, nil
}

func (r *TodoRepo) GetItem(ctx context.Context, todoID, itemID uint) (*model.TodoItem, error) {
	var item model.TodoItem
	if err := r.db.WithContext(ctx).Where("id = ? AND todo_id = ?", itemID, todoID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *TodoRepo) CreateItem(ctx context.Context, item *model.TodoItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return fmt.Errorf("create todo item: %w", err)
		}
		if err := tx.Model(&model.Todo{}).Where("id = ?", item.TodoID).
			UpdateColumn("item_total", gorm.Expr("item_total + 1")).Error; err != nil {
			return fmt.Errorf("bump item_total: %w", err)
		}
		// A freshly-created done item counts toward the parent's done progress.
		if item.Done {
			if err := tx.Model(&model.Todo{}).Where("id = ?", item.TodoID).
				UpdateColumn("item_done", gorm.Expr("item_done + 1")).Error; err != nil {
				return fmt.Errorf("bump item_done: %w", err)
			}
		}
		return nil
	})
}

func (r *TodoRepo) UpdateItem(ctx context.Context, todoID uint, item *model.TodoItem) error {
	if err := r.db.WithContext(ctx).Model(&model.TodoItem{}).
		Where("id = ? AND todo_id = ?", item.ID, todoID).
		Updates(map[string]interface{}{"content": item.Content, "due_time": item.DueTime}).Error; err != nil {
		return fmt.Errorf("update todo item: %w", err)
	}
	return nil
}

// SetItemDone flips an item's done flag and adjusts the parent todo's item_done
// counter inside a single transaction so progress never drifts.
func (r *TodoRepo) SetItemDone(ctx context.Context, todoID, itemID uint, done bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var prev model.TodoItem
		if err := tx.Where("id = ? AND todo_id = ?", itemID, todoID).First(&prev).Error; err != nil {
			return err
		}
		if prev.Done == done {
			return nil
		}
		if err := tx.Model(&model.TodoItem{}).Where("id = ?", itemID).
			UpdateColumn("done", done).Error; err != nil {
			return fmt.Errorf("set item done: %w", err)
		}
		delta := -1
		if done {
			delta = 1
		}
		if err := tx.Model(&model.Todo{}).Where("id = ?", todoID).
			UpdateColumn("item_done", gorm.Expr("item_done + ?", delta)).Error; err != nil {
			return fmt.Errorf("adjust item_done: %w", err)
		}
		return nil
	})
}

func (r *TodoRepo) DeleteItem(ctx context.Context, todoID, itemID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.TodoItem
		if err := tx.Where("id = ? AND todo_id = ?", itemID, todoID).First(&item).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{"item_total": gorm.Expr("item_total - 1")}
		if item.Done {
			updates["item_done"] = gorm.Expr("item_done - 1")
		}
		if err := tx.Model(&model.Todo{}).Where("id = ?", todoID).UpdateColumns(updates).Error; err != nil {
			return fmt.Errorf("decrement item counts: %w", err)
		}
		if err := tx.Where("id = ? AND todo_id = ?", itemID, todoID).Delete(&model.TodoItem{}).Error; err != nil {
			return fmt.Errorf("delete todo item: %w", err)
		}
		return nil
	})
}

// ReorderItem moves a checklist item within its todo to appear right after
// afterItemID (or to the top when nil), renumbering sort_order in a transaction.
func (r *TodoRepo) ReorderItem(ctx context.Context, todoID, itemID uint, afterItemID *uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var all []model.TodoItem
		if err := tx.Where("todo_id = ?", todoID).
			Order("sort_order ASC, id ASC").Find(&all).Error; err != nil {
			return fmt.Errorf("load todo items for reorder: %w", err)
		}

		movedIdx := -1
		rest := make([]model.TodoItem, 0, len(all))
		for i, it := range all {
			if it.ID == itemID {
				movedIdx = i
				continue
			}
			rest = append(rest, it)
		}
		if movedIdx == -1 {
			return nil
		}

		insertAt := 0
		if afterItemID != nil {
			for i, it := range rest {
				if it.ID == *afterItemID {
					insertAt = i + 1
					break
				}
			}
		}

		ordered := make([]model.TodoItem, 0, len(rest)+1)
		ordered = append(ordered, rest[:insertAt]...)
		ordered = append(ordered, all[movedIdx])
		ordered = append(ordered, rest[insertAt:]...)

		for i, it := range ordered {
			if err := tx.Model(&model.TodoItem{}).Where("id = ?", it.ID).
				Update("sort_order", i).Error; err != nil {
				return fmt.Errorf("renumber todo item order: %w", err)
			}
		}
		return nil
	})
}

// PromoteItem turns a checklist item into a standalone todo, inheriting the
// parent's color and tags, then removes the item (adjusting parent counts).
// Everything runs in one transaction so counts never drift.
func (r *TodoRepo) PromoteItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) (*model.Todo, error) {
	var promoted *model.Todo
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.TodoItem
		if err := tx.Where("id = ? AND todo_id = ?", itemID, todoID).First(&item).Error; err != nil {
			return err
		}
		var parent model.Todo
		if err := tx.Where("id = ? AND workspace_id = ?", todoID, workspaceID).First(&parent).Error; err != nil {
			return err
		}

		// Inherit the parent's tags so the promoted task keeps its context.
		var tags []model.Tag
		if err := tx.Model(&parent).Association("Tags").Find(&tags); err != nil {
			return fmt.Errorf("load parent tags: %w", err)
		}

		newTodo := model.Todo{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       item.Content,
			Status:      "pending",
			Priority:    "normal",
			Color:       parent.Color,
			Tags:        tags,
		}
		if item.Done {
			newTodo.Status = "done"
			now := time.Now()
			newTodo.CompletedAt = &now
		}
		if err := tx.Create(&newTodo).Error; err != nil {
			return fmt.Errorf("create promoted todo: %w", err)
		}

		// Remove the source item and fix up the parent's progress counters.
		updates := map[string]interface{}{"item_total": gorm.Expr("item_total - 1")}
		if item.Done {
			updates["item_done"] = gorm.Expr("item_done - 1")
		}
		if err := tx.Model(&model.Todo{}).Where("id = ?", todoID).UpdateColumns(updates).Error; err != nil {
			return fmt.Errorf("decrement item counts: %w", err)
		}
		if err := tx.Where("id = ?", itemID).Delete(&model.TodoItem{}).Error; err != nil {
			return fmt.Errorf("delete promoted item: %w", err)
		}

		promoted = &newTodo
		return nil
	})
	if err != nil {
		return nil, err
	}
	return promoted, nil
}

// Duplicate clones a todo into a new pending todo, copying its fields, tags and
// checklist items (completion state is reset on the parent).
func (r *TodoRepo) Duplicate(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	var src model.Todo
	if err := r.db.WithContext(ctx).Preload("Tags").
		Where("id = ? AND workspace_id = ?", id, workspaceID).First(&src).Error; err != nil {
		return nil, err
	}
	var items []model.TodoItem
	if err := r.db.WithContext(ctx).Where("todo_id = ?", id).
		Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, err
	}

	clone := model.Todo{
		UserID:      userID,
		WorkspaceID: workspaceID,
		Title:       src.Title,
		Description: src.Description,
		Status:      "pending",
		Priority:    src.Priority,
		DueTime:     src.DueTime,
		Amount:      src.Amount,
		AmountType:  src.AmountType,
		ContactIDs:  src.ContactIDs,
		Color:       src.Color,
		Repeat:      src.Repeat,
		ParentID:    src.ParentID,
		SortOrder:   src.SortOrder,
		Tags:        src.Tags,
	}
	if err := r.db.Create(&clone).Error; err != nil {
		return nil, fmt.Errorf("duplicate todo: %w", err)
	}

	// Copy the checklist items onto the clone and sync its progress counters.
	done := 0
	for i, it := range items {
		copy := model.TodoItem{TodoID: clone.ID, Content: it.Content, Done: it.Done, SortOrder: i}
		if err := r.db.Create(&copy).Error; err != nil {
			return nil, fmt.Errorf("duplicate todo item: %w", err)
		}
		if it.Done {
			done++
		}
	}
	if len(items) > 0 {
		if err := r.db.Model(&clone).
			UpdateColumns(map[string]interface{}{"item_total": len(items), "item_done": done}).Error; err != nil {
			return nil, fmt.Errorf("sync clone item counts: %w", err)
		}
		clone.ItemTotal = len(items)
		clone.ItemDone = done
	}
	return &clone, nil
}

// SetPinned sets the pinned (starred) flag on a single todo.
func (r *TodoRepo) SetPinned(ctx context.Context, workspaceID, id uint, pinned bool) error {
	if err := r.db.WithContext(ctx).Model(&model.Todo{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		UpdateColumn("pinned", pinned).Error; err != nil {
		return fmt.Errorf("set todo pinned: %w", err)
	}
	return nil
}

// ListTrash returns soft-deleted todos for a workspace, newest-deleted first.
func (r *TodoRepo) ListTrash(ctx context.Context, workspaceID uint) ([]model.Todo, error) {
	var todos []model.Todo
	if err := r.db.Unscoped().WithContext(ctx).
		Where("workspace_id = ? AND deleted_at IS NOT NULL", workspaceID).
		Order("deleted_at DESC").
		Find(&todos).Error; err != nil {
		return nil, fmt.Errorf("list trashed todos: %w", err)
	}
	return todos, nil
}

// Restore un-deletes a soft-deleted todo. Returns gorm.ErrRecordNotFound when
// the todo isn't a deleted member of the workspace.
// Restore un-deletes a todo AND its descendants (the mirror of cascade Delete),
// so restoring a parent brings its whole subtree back from the trash together.
// Returns gorm.ErrRecordNotFound when the todo isn't a deleted member.
func (r *TodoRepo) Restore(ctx context.Context, workspaceID, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// The parent must currently be a soft-deleted member of the workspace.
		var parent model.Todo
		if err := tx.Unscoped().Where("id = ? AND workspace_id = ? AND deleted_at IS NOT NULL", id, workspaceID).
			First(&parent).Error; err != nil {
			return gorm.ErrRecordNotFound
		}
		// Gather the full descendant subtree from the complete graph (including
		// soft-deleted rows) so a cascade-deleted tree restores together.
		var nodes []model.Todo
		if err := tx.Unscoped().Where("workspace_id = ?", workspaceID).
			Select("id, parent_id").Find(&nodes).Error; err != nil {
			return fmt.Errorf("load todo graph for cascade restore: %w", err)
		}
		children := make(map[uint][]uint)
		for _, n := range nodes {
			if n.ParentID != nil {
				children[*n.ParentID] = append(children[*n.ParentID], n.ID)
			}
		}
		var ids []uint
		seen := map[uint]bool{}
		queue := []uint{id}
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			if seen[cur] {
				continue
			}
			seen[cur] = true
			ids = append(ids, cur)
			queue = append(queue, children[cur]...)
		}
		if err := tx.Unscoped().Model(&model.Todo{}).
			Where("id IN ? AND workspace_id = ? AND deleted_at IS NOT NULL", ids, workspaceID).
			Update("deleted_at", nil).Error; err != nil {
			return fmt.Errorf("cascade restore todos: %w", err)
		}
		return nil
	})
}

// BulkAction applies a complete-or-delete action to a set of todos, returning
// the number of rows affected.
func (r *TodoRepo) BulkAction(ctx context.Context, workspaceID uint, ids []uint, action string) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	switch action {
	case "complete":
		return r.bulkComplete(ctx, workspaceID, ids)
	case "delete":
		// Cascade to descendants so bulk-deleting a parent removes its subtree
		// too — consistent with single Delete (which also cascades).
		delIDs, err := r.descendantIDsInclusive(ctx, workspaceID, ids)
		if err != nil {
			return 0, err
		}
		res := r.db.WithContext(ctx).Where("id IN ? AND workspace_id = ?", delIDs, workspaceID).Delete(&model.Todo{})
		return res.RowsAffected, wrapIfErr(res.Error, "bulk delete todos")
	default:
		return 0, fmt.Errorf("unknown bulk action: %s", action)
	}
}

// descendantIDsInclusive returns the given ids together with all of their
// (transitive) descendants in the workspace, so a cascade delete/restore covers
// the full subtree. It is read-only and does not itself mutate.
func (r *TodoRepo) descendantIDsInclusive(ctx context.Context, workspaceID uint, ids []uint) ([]uint, error) {
	var nodes []model.Todo
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Select("id, parent_id").Find(&nodes).Error; err != nil {
		return nil, fmt.Errorf("load todo graph for cascade: %w", err)
	}
	children := make(map[uint][]uint)
	for _, n := range nodes {
		if n.ParentID != nil {
			children[*n.ParentID] = append(children[*n.ParentID], n.ID)
		}
	}
	var out []uint
	seen := make(map[uint]bool)
	queue := append([]uint{}, ids...)
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if seen[cur] {
			continue
		}
		seen[cur] = true
		out = append(out, cur)
		queue = append(queue, children[cur]...)
	}
	return out, nil
}

// bulkComplete mirrors single-toggle semantics: recurring tasks with a due date
// advance to their next occurrence (staying pending) instead of being marked
// done. Everything runs in one transaction so the batch is all-or-nothing.
func (r *TodoRepo) bulkComplete(ctx context.Context, workspaceID uint, ids []uint) (int64, error) {
	affected := int64(0)
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var pending []model.Todo
		if err := tx.Where("id IN ? AND workspace_id = ? AND status = ?", ids, workspaceID, "pending").
			Find(&pending).Error; err != nil {
			return fmt.Errorf("load todos for bulk complete: %w", err)
		}
		now := time.Now()
		var doneIDs []uint
		for _, t := range pending {
			if t.Repeat != "" && t.DueTime != nil {
				if next, ok := model.NextDueTime(t.Repeat, t.RepeatInterval, *t.DueTime, now); ok {
					if err := tx.Model(&model.Todo{}).Where("id = ?", t.ID).
						Updates(map[string]interface{}{"due_time": next, "completed_at": nil}).Error; err != nil {
						return fmt.Errorf("advance recurring todo: %w", err)
					}
					affected++
					continue
				}
			}
			doneIDs = append(doneIDs, t.ID)
		}
		if len(doneIDs) > 0 {
			res := tx.Model(&model.Todo{}).Where("id IN ?", doneIDs).
				Updates(map[string]interface{}{"status": "done", "completed_at": now})
			if err := wrapIfErr(res.Error, "bulk complete todos"); err != nil {
				return err
			}
			affected += res.RowsAffected
		}
		return nil
	})
	return affected, err
}

// wrapIfErr returns nil when err is nil so the RowsAffected path stays clean.
func wrapIfErr(err error, msg string) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", msg, err)
}
