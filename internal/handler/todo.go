package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type TodoHandler struct {
	svc *service.TodoService
}

func NewTodoHandler(svc *service.TodoService) *TodoHandler {
	return &TodoHandler{svc: svc}
}

type createTodoRequest struct {
	Title       string   `json:"title" binding:"required"`
	Description string   `json:"description"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	DueTime     string   `json:"due_time"`
	StartTime   string   `json:"start_time"`
	Amount      *float64 `json:"amount"`
	AmountType  string   `json:"amount_type"`
	ContactIDs  []uint   `json:"contact_ids"`
	Color       string   `json:"color"`
	Repeat      string   `json:"repeat"`
	RepeatInterval int    `json:"repeat_interval"`
	ParentID    *uint    `json:"parent_id"`
}

type updateTodoRequest struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Status       string   `json:"status"`
	Priority     string   `json:"priority"`
	DueTime      string   `json:"due_time"`
	ClearDueTime bool     `json:"clear_due_time"`
	StartTime    string   `json:"start_time"`
	ClearStartTime bool   `json:"clear_start_time"`
	Amount       *float64 `json:"amount"`
	ClearAmount  bool     `json:"clear_amount"`
	AmountType   string   `json:"amount_type"`
	ContactIDs   []uint   `json:"contact_ids"`
	Color        string   `json:"color"`
	Repeat       string   `json:"repeat"`
	RepeatInterval int    `json:"repeat_interval"`
}

// parseDueQuery parses an optional RFC3339 due-time query parameter.
// Returns nil when the parameter is absent or empty.
func parseDueQuery(c *gin.Context, key string) (*time.Time, bool) {
	raw := c.Query(key)
	if raw == "" {
		return nil, true
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, false
	}
	return &t, true
}

func (h *TodoHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))

	q := model.TodoListQuery{
		Status:   c.Query("status"),
		Priority: c.Query("priority"),
		Search:   c.Query("q"),
		Sort:     c.DefaultQuery("sort", model.TodoSortDueDate),
		Order:    c.DefaultQuery("order", "asc"),
		Page:     page,
		PageSize: pageSize,
	}
	if v := c.Query("overdue"); v == "1" || v == "true" {
		q.Overdue = true
	}
	if v := c.Query("started"); v == "1" || v == "true" {
		q.Started = true
	}
	for _, raw := range c.QueryArray("tag_id") {
		if id, err := strconv.ParseUint(raw, 10, 32); err == nil {
			q.TagIDs = append(q.TagIDs, uint(id))
		}
	}
	if dueAfter, ok := parseDueQuery(c, "due_after"); !ok {
		response.BadRequest(c, "invalid due_after format")
		return
	} else {
		q.DueAfter = dueAfter
	}
	if dueBefore, ok := parseDueQuery(c, "due_before"); !ok {
		response.BadRequest(c, "invalid due_before format")
		return
	} else {
		q.DueBefore = dueBefore
	}

	todos, total, err := h.svc.List(c.Request.Context(), userID, workspaceID, q)
	if err != nil {
		response.InternalError(c, "failed to list todos")
		return
	}

	response.OKPaginated(c, todos, total, q.Page, q.PageSize)
}

func (h *TodoHandler) Stats(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	stats, err := h.svc.Stats(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to compute todo stats")
		return
	}

	response.OK(c, stats)
}

// ListTrash returns soft-deleted todos.
func (h *TodoHandler) ListTrash(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	todos, err := h.svc.ListTrash(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list trash")
		return
	}

	response.OK(c, todos)
}

// Restore un-deletes a soft-deleted todo.
func (h *TodoHandler) Restore(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	if err := h.svc.Restore(c.Request.Context(), userID, workspaceID, id); err != nil {
		response.NotFound(c, "todo not found")
		return
	}

	response.OK(c, nil)
}

type reorderTodoRequest struct {
	AfterID *uint `json:"after_id"`
}

// Reorder moves a todo within the workspace's manual order.
func (h *TodoHandler) Reorder(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	var req reorderTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.Reorder(c.Request.Context(), userID, workspaceID, id, req.AfterID); err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to reorder todo")
		return
	}

	response.OK(c, nil)
}

type moveTodoRequest struct {
	ParentID *uint `json:"parent_id"`
	AfterID  *uint `json:"after_id"`
}

// Move reparents a todo (parent_id; nil/omitted = root) and reorders it among
// its siblings — the primitive behind tree nesting (indent/outdent/reorder).
func (h *TodoHandler) Move(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	var req moveTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.Move(c.Request.Context(), userID, workspaceID, id, req.ParentID, req.AfterID); err != nil {
		switch {
		case errors.Is(err, service.ErrTodoNotFound):
			response.NotFound(c, "todo not found")
		case errors.Is(err, repository.ErrTodoCycle),
			errors.Is(err, repository.ErrTodoSelfParent),
			errors.Is(err, repository.ErrTodoInvalidParent):
			response.BadRequest(c, err.Error())
		default:
			response.InternalError(c, "failed to move todo")
		}
		return
	}

	response.OK(c, nil)
}

func (h *TodoHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req createTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	todo := &model.Todo{
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		Amount:      req.Amount,
		AmountType:  req.AmountType,
		ContactIDs:  req.ContactIDs,
		Color:       req.Color,
		Repeat:      req.Repeat,
		RepeatInterval: req.RepeatInterval,
		ParentID:    req.ParentID,
	}

	if req.DueTime != "" {
		t, err := time.Parse(time.RFC3339, req.DueTime)
		if err != nil {
			response.BadRequest(c, "invalid due_time format")
			return
		}
		todo.DueTime = &t
	}

	if req.StartTime != "" {
		t, err := time.Parse(time.RFC3339, req.StartTime)
		if err != nil {
			response.BadRequest(c, "invalid start_time format")
			return
		}
		todo.StartTime = &t
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, todo)
	if err != nil {
		if errors.Is(err, service.ErrTodoInvalidParent) {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to create todo")
		return
	}

	response.Created(c, result)
}

func (h *TodoHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	var req updateTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := &model.Todo{
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		Amount:      req.Amount,
		AmountType:  req.AmountType,
		ContactIDs:  req.ContactIDs,
		Color:       req.Color,
		Repeat:      req.Repeat,
		RepeatInterval: req.RepeatInterval,
	}
	clear := service.TodoClear{
		DueTime:   req.ClearDueTime,
		StartTime: req.ClearStartTime,
		Amount:    req.ClearAmount,
	}

	if req.DueTime != "" {
		t, err := time.Parse(time.RFC3339, req.DueTime)
		if err != nil {
			response.BadRequest(c, "invalid due_time format")
			return
		}
		updates.DueTime = &t
	}

	if req.StartTime != "" {
		t, err := time.Parse(time.RFC3339, req.StartTime)
		if err != nil {
			response.BadRequest(c, "invalid start_time format")
			return
		}
		updates.StartTime = &t
	}

	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), updates, clear)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to update todo")
		return
	}

	response.OK(c, result)
}

func (h *TodoHandler) ToggleStatus(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	result, err := h.svc.ToggleStatus(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to toggle todo")
		return
	}

	response.OK(c, result)
}

func (h *TodoHandler) SyncToEvent(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	event, err := h.svc.SyncToEvent(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to sync todo to event")
		return
	}

	response.Created(c, event)
}

func (h *TodoHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "todo not found")
		return
	}

	response.OK(c, nil)
}

// --- Checklist (subtask) endpoints ---

type createTodoItemRequest struct {
	Content string `json:"content" binding:"required"`
}

type updateTodoItemRequest struct {
	Content      string `json:"content" binding:"required"`
	DueTime      string `json:"due_time"`
	ClearDueTime bool   `json:"clear_due_time"`
}

func (h *TodoHandler) parseTodoID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return 0, false
	}
	return uint(id), true
}

func (h *TodoHandler) parseTodoItemID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("itemId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo item id")
		return 0, false
	}
	return uint(id), true
}

func (h *TodoHandler) ListItems(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	items, err := h.svc.ListItems(c.Request.Context(), userID, workspaceID, todoID)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to list todo items")
		return
	}

	response.OK(c, items)
}

func (h *TodoHandler) CreateItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	var req createTodoItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	item, err := h.svc.CreateItem(c.Request.Context(), userID, workspaceID, todoID, req.Content)
	if err != nil {
		switch err {
		case service.ErrTodoNotFound:
			response.NotFound(c, "todo not found")
		case service.ErrTodoItemEmpty:
			response.BadRequest(c, "content is required")
		default:
			response.InternalError(c, "failed to create todo item")
		}
		return
	}

	response.Created(c, item)
}

func (h *TodoHandler) UpdateItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	itemID, ok := h.parseTodoItemID(c)
	if !ok {
		return
	}

	var req updateTodoItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	var dueTime *time.Time
	if req.DueTime != "" {
		t, err := time.Parse(time.RFC3339, req.DueTime)
		if err != nil {
			response.BadRequest(c, "invalid due_time format")
			return
		}
		dueTime = &t
	}

	item, err := h.svc.UpdateItem(c.Request.Context(), userID, workspaceID, todoID, itemID, req.Content, dueTime, req.ClearDueTime)
	if err != nil {
		switch err {
		case service.ErrTodoNotFound:
			response.NotFound(c, "todo not found")
		case service.ErrTodoItemNotFound:
			response.NotFound(c, "todo item not found")
		case service.ErrTodoItemEmpty:
			response.BadRequest(c, "content is required")
		default:
			response.InternalError(c, "failed to update todo item")
		}
		return
	}

	response.OK(c, item)
}

func (h *TodoHandler) ToggleItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	itemID, ok := h.parseTodoItemID(c)
	if !ok {
		return
	}

	item, err := h.svc.ToggleItem(c.Request.Context(), userID, workspaceID, todoID, itemID)
	if err != nil {
		switch err {
		case service.ErrTodoNotFound:
			response.NotFound(c, "todo not found")
		case service.ErrTodoItemNotFound:
			response.NotFound(c, "todo item not found")
		default:
			response.InternalError(c, "failed to toggle todo item")
		}
		return
	}

	response.OK(c, item)
}

func (h *TodoHandler) DeleteItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	itemID, ok := h.parseTodoItemID(c)
	if !ok {
		return
	}

	if err := h.svc.DeleteItem(c.Request.Context(), userID, workspaceID, todoID, itemID); err != nil {
		switch err {
		case service.ErrTodoNotFound:
			response.NotFound(c, "todo not found")
		case service.ErrTodoItemNotFound:
			response.NotFound(c, "todo item not found")
		default:
			response.InternalError(c, "failed to delete todo item")
		}
		return
	}

	response.OK(c, nil)
}

// ReorderItem moves a checklist item within its todo's manual order.
func (h *TodoHandler) ReorderItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	itemID, ok := h.parseTodoItemID(c)
	if !ok {
		return
	}

	var req reorderTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReorderItem(c.Request.Context(), userID, workspaceID, todoID, itemID, req.AfterID); err != nil {
		switch err {
		case service.ErrTodoNotFound:
			response.NotFound(c, "todo not found")
		case service.ErrTodoItemNotFound:
			response.NotFound(c, "todo item not found")
		default:
			response.InternalError(c, "failed to reorder todo item")
		}
		return
	}

	response.OK(c, nil)
}

// PromoteItem turns a checklist item into a standalone todo.
func (h *TodoHandler) PromoteItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	itemID, ok := h.parseTodoItemID(c)
	if !ok {
		return
	}

	todo, err := h.svc.PromoteItem(c.Request.Context(), userID, workspaceID, todoID, itemID)
	if err != nil {
		switch err {
		case service.ErrTodoNotFound:
			response.NotFound(c, "todo not found")
		case service.ErrTodoItemNotFound:
			response.NotFound(c, "todo item not found")
		default:
			response.InternalError(c, "failed to promote todo item")
		}
		return
	}

	response.Created(c, todo)
}

// Duplicate clones a todo.
func (h *TodoHandler) Duplicate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	clone, err := h.svc.Duplicate(c.Request.Context(), userID, workspaceID, id)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to duplicate todo")
		return
	}

	response.Created(c, clone)
}

// TogglePin flips a todo's pinned (starred) state.
func (h *TodoHandler) TogglePin(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	todo, err := h.svc.TogglePin(c.Request.Context(), userID, workspaceID, id)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to toggle pin")
		return
	}

	response.OK(c, todo)
}

type bulkTodoRequest struct {
	IDs    []uint `json:"ids"`
	Action string `json:"action"` // "complete" | "delete"
}

// BulkAction completes or deletes many todos at once.
func (h *TodoHandler) BulkAction(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req bulkTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if req.Action != "complete" && req.Action != "delete" {
		response.BadRequest(c, "action must be 'complete' or 'delete'")
		return
	}
	if len(req.IDs) == 0 {
		response.BadRequest(c, "ids is required")
		return
	}

	affected, err := h.svc.BulkAction(c.Request.Context(), userID, workspaceID, req.IDs, req.Action)
	if err != nil {
		response.InternalError(c, "failed to apply bulk action")
		return
	}

	response.OK(c, map[string]interface{}{"affected": affected})
}

// --- Tag association endpoints ---

type replaceTodoTagsRequest struct {
	TagIDs []uint `json:"tag_ids"`
}

func (h *TodoHandler) GetTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	tags, err := h.svc.GetTags(c.Request.Context(), userID, workspaceID, todoID)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to get todo tags")
		return
	}

	response.OK(c, tags)
}

func (h *TodoHandler) ReplaceTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	var req replaceTodoTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReplaceTags(c.Request.Context(), userID, workspaceID, todoID, req.TagIDs); err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to replace todo tags")
		return
	}

	response.OK(c, nil)
}
