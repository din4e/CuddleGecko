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
	Title      string   `json:"title" binding:"required"`
	Status     string   `json:"status"`
	Priority   string   `json:"priority"`
	DueTime    string   `json:"due_time"`
	Amount     *float64 `json:"amount"`
	AmountType string   `json:"amount_type"`
	ContactIDs []uint   `json:"contact_ids"`
	Color      string   `json:"color"`
}

type updateTodoRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	DueTime     string   `json:"due_time"`
	ClearDueTime bool    `json:"clear_due_time"`
	Amount      *float64 `json:"amount"`
	AmountType  string   `json:"amount_type"`
	ContactIDs  []uint   `json:"contact_ids"`
	Color       string   `json:"color"`
}

func (h *TodoHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var status *string
	if v := c.Query("status"); v != "" {
		status = &v
	}

	todos, err := h.svc.List(c.Request.Context(), userID, workspaceID, status)
	if err != nil {
		response.InternalError(c, "failed to list todos")
		return
	}

	response.OK(c, todos)
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
		Title:      req.Title,
		Status:     req.Status,
		Priority:   req.Priority,
		Amount:     req.Amount,
		AmountType: req.AmountType,
		ContactIDs: req.ContactIDs,
		Color:      req.Color,
	}

	if req.DueTime != "" {
		t, err := time.Parse(time.RFC3339, req.DueTime)
		if err != nil {
			response.BadRequest(c, "invalid due_time format")
			return
		}
		todo.DueTime = &t
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, todo)
	if err != nil {
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
	}

	if req.DueTime != "" {
		t, err := time.Parse(time.RFC3339, req.DueTime)
		if err != nil {
			response.BadRequest(c, "invalid due_time format")
			return
		}
		updates.DueTime = &t
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
