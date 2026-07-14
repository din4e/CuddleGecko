package handler

import (
	"strconv"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
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
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	DueTime     string   `json:"due_time"`
	Amount      *float64 `json:"amount"`
	AmountType  string   `json:"amount_type"`
	ContactIDs  []uint   `json:"contact_ids"`
	Color       string   `json:"color"`
	ListID      *uint    `json:"list_id"`
	RepeatRule  string   `json:"repeat_rule"`
	RepeatEvery int      `json:"repeat_every"`
	RepeatUntil string   `json:"repeat_until"`
	TagIDs      []uint   `json:"tag_ids"`
}

type updateTodoRequest struct {
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Status         string   `json:"status"`
	Priority       string   `json:"priority"`
	DueTime        string   `json:"due_time"`
	ClearDueTime   bool     `json:"clear_due_time"`
	Amount         *float64 `json:"amount"`
	AmountType     string   `json:"amount_type"`
	ContactIDs     []uint   `json:"contact_ids"`
	Color          string   `json:"color"`
	ListID         *uint    `json:"list_id"`
	RepeatRule     string   `json:"repeat_rule"`
	RepeatEvery    int      `json:"repeat_every"`
	RepeatUntil    string   `json:"repeat_until"`
	ClearRepeatEnd bool     `json:"clear_repeat_end"`
	TagIDs         []uint   `json:"tag_ids"`
}

type replaceTodoTagsRequest struct {
	TagIDs []uint `json:"tag_ids" binding:"required"`
}

func (h *TodoHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))

	var status *string
	if v := c.Query("status"); v != "" {
		status = &v
	}

	var listID *uint
	if v := c.Query("list_id"); v != "" {
		if v == "inbox" {
			z := uint(0)
			listID = &z
		} else if n, err := strconv.ParseUint(v, 10, 32); err == nil {
			u := uint(n)
			listID = &u
		}
	}

	var tagIDs []uint
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := strconv.ParseUint(idStr, 10, 32); err == nil {
			tagIDs = append(tagIDs, uint(id))
		}
	}

	overdue := c.Query("overdue") == "true" || c.Query("overdue") == "1"

	todos, total, err := h.svc.List(c.Request.Context(), userID, workspaceID, status, listID, tagIDs, overdue, page, pageSize)
	if err != nil {
		response.InternalError(c, "failed to list todos")
		return
	}

	response.OKPaginated(c, todos, total, page, pageSize)
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
		Status:      req.Status,
		Priority:    req.Priority,
		Amount:      req.Amount,
		AmountType:  req.AmountType,
		ContactIDs:  req.ContactIDs,
		Color:       req.Color,
		ListID:      req.ListID,
		RepeatRule:  req.RepeatRule,
		RepeatEvery: req.RepeatEvery,
	}

	if err := bindTodoTimes(req.DueTime, req.RepeatUntil, todo); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, todo)
	if err != nil {
		response.InternalError(c, "failed to create todo")
		return
	}

	if req.TagIDs != nil {
		_ = h.svc.SetTags(c.Request.Context(), userID, workspaceID, result.ID, req.TagIDs)
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
		ListID:      req.ListID,
		RepeatRule:  req.RepeatRule,
		RepeatEvery: req.RepeatEvery,
	}

	if err := bindTodoTimes(req.DueTime, req.RepeatUntil, updates); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), updates)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to update todo")
		return
	}

	if req.TagIDs != nil {
		_ = h.svc.SetTags(c.Request.Context(), userID, workspaceID, uint(id), req.TagIDs)
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

func (h *TodoHandler) GetTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	tags, err := h.svc.GetTags(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		response.NotFound(c, "todo not found")
		return
	}

	response.OK(c, tags)
}

func (h *TodoHandler) ReplaceTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	var req replaceTodoTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.SetTags(c.Request.Context(), userID, workspaceID, uint(id), req.TagIDs); err != nil {
		response.NotFound(c, "todo not found")
		return
	}

	response.OK(c, nil)
}

// bindTodoTimes parses due_time and repeat_until RFC3339 strings onto the todo.
// Empty strings leave the pointer nil, which GORM writes as NULL (clearing).
func bindTodoTimes(dueTime, repeatUntil string, todo *model.Todo) error {
	if dueTime != "" {
		t, err := time.Parse(time.RFC3339, dueTime)
		if err != nil {
			return errInvalidDueTime
		}
		todo.DueTime = &t
	}
	if repeatUntil != "" {
		t, err := time.Parse(time.RFC3339, repeatUntil)
		if err != nil {
			return errInvalidDueTime
		}
		todo.RepeatUntil = &t
	}
	return nil
}

var errInvalidDueTime = &invalidTimeError{}

type invalidTimeError struct{}

func (e *invalidTimeError) Error() string { return "invalid time format" }
