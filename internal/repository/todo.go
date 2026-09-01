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
	q.Page, q.PageSize = clampPage(q.Page, q.PageSize)

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
	if q.Deferred {
		// The inverse of Started, mirroring the stats "deferred" bucket exactly:
		// pending tasks whose start_time is still in the future.
		now := time.Now()
		query = query.Where("status = ? AND start_time IS NOT NULL AND start_time > ?", "pending", now)
	}
	if q.DoneAfter != nil {
		// Completed at or after this time — backs the done-today / done-this-week
		// smart lists (paired with status=done from the caller).
		query = query.Where("completed_at IS NOT NULL AND completed_at >= ?", *q.DoneAfter)
	}
	if len(q.TagIDs) > 0 {
		// Subquery (instead of JOIN) keeps the count correct even when a todo
		// matches more than one of the requested tags.
		query = query.Where("id IN (SELECT todo_id FROM todo_tags WHERE tag_id IN ?)", q.TagIDs)
	}
	if q.RootsOnly {
		// A child whose parent is soft-deleted (restored alone from the trash)
		// would otherwise match neither the roots query nor any parent's
		// children query — invisible. Surface orphaned nodes as roots.
		query = query.Where(
			"parent_id IS NULL OR parent_id IN (SELECT id FROM todos p WHERE p.workspace_id = ? AND p.deleted_at IS NOT NULL)",
			workspaceID,
		)
	}
	if q.ParentID != nil {
		query = query.Where("parent_id = ?", *q.ParentID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count todos: %w", err)
	}

	var todos []model.Todo
	offset := (q.Page - 1) * q.PageSize
	// child_count is a correlated scalar subquery (works on both SQLite and
	// MySQL); Select must come after Count so it doesn't pollute the COUNT.
	// The subquery filters soft-deleted rows manually — GORM's automatic
	// deleted_at clause only applies to the outer query.
	if err := query.
		Select("todos.*, (SELECT COUNT(*) FROM todos c WHERE c.parent_id = todos.id AND c.workspace_id = ? AND c.deleted_at IS NULL) AS child_count", workspaceID).
		Order(todoOrderClause(q.Sort, q.Order)).Preload("Tags").
		Limit(q.PageSize).Offset(offset).
		Find(&todos).Error; err != nil {
		return nil, 0, fmt.Errorf("list todos: %w", err)
	}
	return todos, total, nil
}

// todoOrderClause builds the ORDER BY clause for the requested sort key.
// Pending tasks always surface before closed ones (done or abandoned), and
// priority acts as a secondary tiebreaker — mirroring TickTick's default task
// ordering.
func todoOrderClause(sort, order string) string {
	dir := "ASC"
	if strings.EqualFold(order, "desc") {
		dir = "DESC"
	}

	const (
		pendingFirst  = "CASE WHEN status = 'pending' THEN 0 ELSE 1 END"
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
		ids, err := r.subtreeIDs(tx, workspaceID, []uint{id}, false)
		if err != nil {
			return err
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

		ids := make([]uint, len(ordered))
		for i, t := range ordered {
			ids[i] = t.ID
		}
		if err := renumberSortOrder(tx, &model.Todo{}, ids); err != nil {
			return fmt.Errorf("renumber todo order: %w", err)
		}
		return nil
	})
}

// Move reparents a todo (parent_id; nil = root) and reorders it to appear right
// after afterID among its (new) siblings. Parent existence and cycle safety
// (can't move under itself or a descendant) are validated inside the same
// transaction; sibling sort_order is renumbered per parent group. Position:
// after afterID when set, else "last" appends at the end of the sibling group,
// anything else lands at the top.
func (r *TodoRepo) Move(ctx context.Context, workspaceID, id uint, parentID, afterID *uint, position string) error {
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
			// Cycle check: moving `id` under `parentID` would create a cycle if
			// `id` is an ancestor of `parentID`. One recursive-CTE walk up the
			// parent chain replaces a query-per-ancestor.
			isAnc, err := r.ancestorChainContains(tx, workspaceID, *parentID, id)
			if err != nil {
				return err
			}
			if isAnc {
				return ErrTodoCycle
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
		} else if position == "last" {
			insertAt = len(siblings)
		}
		ordered := make([]model.Todo, 0, len(siblings)+1)
		ordered = append(ordered, siblings[:insertAt]...)
		ordered = append(ordered, model.Todo{ID: id})
		ordered = append(ordered, siblings[insertAt:]...)
		ids := make([]uint, len(ordered))
		for i, t := range ordered {
			ids[i] = t.ID
		}
		if err := renumberSortOrder(tx, &model.Todo{}, ids); err != nil {
			return fmt.Errorf("renumber siblings after move: %w", err)
		}
		return nil
	})
}

// Stats computes a productivity overview in a single pass over the workspace's
// todos via conditional aggregation, instead of six sequential COUNT queries.
func (r *TodoRepo) Stats(ctx context.Context, workspaceID uint) (model.TodoStats, error) {
	now := time.Now()
	startToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	daysSinceMonday := int(now.Weekday()) - int(time.Monday)
	if daysSinceMonday < 0 {
		daysSinceMonday += 7
	}
	startWeek := startToday.AddDate(0, 0, -daysSinceMonday)

	var stats model.TodoStats
	var row struct {
		Total        int64 `gorm:"column:total"`
		Pending      int64 `gorm:"column:pending"`
		Overdue      int64 `gorm:"column:overdue"`
		Deferred     int64 `gorm:"column:deferred"`
		DoneToday    int64 `gorm:"column:done_today"`
		DoneThisWeek int64 `gorm:"column:done_this_week"`
	}
	if err := r.db.WithContext(ctx).Model(&model.Todo{}).
		Where("workspace_id = ?", workspaceID).
		Select("COUNT(*) AS total, "+
			"COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pending, "+
			"COALESCE(SUM(CASE WHEN status = ? AND due_time IS NOT NULL AND due_time < ? THEN 1 ELSE 0 END), 0) AS overdue, "+
			"COALESCE(SUM(CASE WHEN status = ? AND start_time IS NOT NULL AND start_time > ? THEN 1 ELSE 0 END), 0) AS deferred, "+
			"COALESCE(SUM(CASE WHEN status = ? AND completed_at >= ? THEN 1 ELSE 0 END), 0) AS done_today, "+
			"COALESCE(SUM(CASE WHEN status = ? AND completed_at >= ? THEN 1 ELSE 0 END), 0) AS done_this_week",
			"pending",
			"pending", now,
			"pending", now,
			"done", startToday,
			"done", startWeek,
		).
		Scan(&row).Error; err != nil {
		return stats, fmt.Errorf("todo stats: %w", err)
	}
	stats.Total = row.Total
	stats.Pending = row.Pending
	stats.Overdue = row.Overdue
	stats.Deferred = row.Deferred
	stats.DoneToday = row.DoneToday
	stats.DoneThisWeek = row.DoneThisWeek
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

// ListItemsByTodoIDs is the bulk counterpart to ListItems: it fetches checklist
// items for many todos in a single query (ordered so per-todo grouping stays
// stable), used by export to avoid an N+1 of one query per todo.
func (r *TodoRepo) ListItemsByTodoIDs(ctx context.Context, todoIDs []uint) ([]model.TodoItem, error) {
	if len(todoIDs) == 0 {
		return nil, nil
	}
	var items []model.TodoItem
	if err := r.db.WithContext(ctx).Where("todo_id IN ?", todoIDs).
		Order("todo_id ASC, sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, fmt.Errorf("list todo items by ids: %w", err)
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

		ids := make([]uint, len(ordered))
		for i, it := range ordered {
			ids[i] = it.ID
		}
		if err := renumberSortOrder(tx, &model.TodoItem{}, ids); err != nil {
			return fmt.Errorf("renumber todo item order: %w", err)
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

// SetParent re-parents a todo in a single UPDATE (external imports link
// children after all rows exist). parentID nil promotes to top level.
func (r *TodoRepo) SetParent(ctx context.Context, workspaceID, id uint, parentID *uint) error {
	if err := r.db.WithContext(ctx).Model(&model.Todo{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		UpdateColumn("parent_id", parentID).Error; err != nil {
		return fmt.Errorf("set todo parent: %w", err)
	}
	return nil
}

// UpdateCreatedAt restores a todo's original creation timestamp in a single
// UPDATE (imports keep the source platform's created time).
func (r *TodoRepo) UpdateCreatedAt(ctx context.Context, id uint, at time.Time) error {
	if err := r.db.WithContext(ctx).Model(&model.Todo{}).
		Where("id = ?", id).
		UpdateColumn("created_at", at).Error; err != nil {
		return fmt.Errorf("update todo created_at: %w", err)
	}
	return nil
}

// IncrementPomodoro atomically bumps a todo's completed-pomodoro count by one.
func (r *TodoRepo) IncrementPomodoro(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Model(&model.Todo{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		UpdateColumn("pomodoro_count", gorm.Expr("pomodoro_count + 1")).Error; err != nil {
		return fmt.Errorf("increment pomodoro: %w", err)
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
		// Gather the full descendant subtree (including soft-deleted rows) so a
		// cascade-deleted tree restores together.
		ids, err := r.subtreeIDs(tx, workspaceID, []uint{id}, true)
		if err != nil {
			return err
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
// (transitive) non-deleted descendants in the workspace, so a cascade delete
// covers the full subtree. Read-only; delegates to subtreeIDs.
func (r *TodoRepo) descendantIDsInclusive(ctx context.Context, workspaceID uint, ids []uint) ([]uint, error) {
	return r.subtreeIDs(r.db.WithContext(ctx), workspaceID, ids, false)
}

// subtreeIDs returns each root id together with all of its transitive
// descendants in the workspace, computed by a recursive CTE. This replaces an
// earlier implementation that loaded the entire workspace todo graph and ran a
// BFS in Go on every delete/restore — a full table scan on the hottest write
// path. The depth cap preserves the old BFS's cycle guard: the tree is kept
// acyclic by Move's validation, but the cap makes a corrupt cycle fail-safe
// instead of recursing forever. When includeDeleted is true the traversal also
// walks soft-deleted rows, which Restore needs because a cascade-deleted
// subtree is deleted in its entirety.
// ancestorChainContains reports whether targetID is in startID's ancestor chain
// (startID itself, or reachable by following parent_id upward). It uses one
// recursive CTE instead of Move's former one-query-per-ancestor walk, and stops
// naturally at a dangling parent_id (the old loop's break-on-not-found). The
// depth cap guards against corrupt cycles. Used by Move's cycle check.
func (r *TodoRepo) ancestorChainContains(tx *gorm.DB, workspaceID, startID, targetID uint) (bool, error) {
	var count int64
	err := tx.Raw(`WITH RECURSIVE chain(id, depth) AS (
		SELECT id, 0 FROM todos WHERE id = ? AND workspace_id = ?
		UNION ALL
		SELECT t.parent_id, c.depth + 1 FROM todos t JOIN chain c ON t.id = c.id
		WHERE t.parent_id IS NOT NULL AND c.depth < 1000
	)
	SELECT COUNT(*) FROM chain WHERE id = ?`, startID, workspaceID, targetID).Scan(&count).Error
	if err != nil {
		return false, fmt.Errorf("ancestor chain check: %w", err)
	}
	return count > 0, nil
}

func (r *TodoRepo) subtreeIDs(tx *gorm.DB, workspaceID uint, roots []uint, includeDeleted bool) ([]uint, error) {
	if len(roots) == 0 {
		return nil, nil
	}
	deletedFilter := " AND deleted_at IS NULL"
	if includeDeleted {
		deletedFilter = ""
	}
	var ids []uint
	err := tx.Raw(`WITH RECURSIVE subtree(id, depth) AS (
		SELECT id, 0 FROM todos WHERE id IN ? AND workspace_id = ?`+deletedFilter+`
		UNION ALL
		SELECT t.id, s.depth + 1 FROM todos t JOIN subtree s ON t.parent_id = s.id
		WHERE t.workspace_id = ? AND s.depth < 1000`+deletedFilter+`
	)
	SELECT id FROM subtree`, roots, workspaceID, workspaceID).Scan(&ids).Error
	if err != nil {
		return nil, fmt.Errorf("compute todo subtree: %w", err)
	}
	return ids, nil
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
