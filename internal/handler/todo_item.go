package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type TodoItemHandler struct {
	svc *service.TodoItemService
}

func NewTodoItemHandler(svc *service.TodoItemService) *TodoItemHandler {
	return &TodoItemHandler{svc: svc}
}

type createTodoItemRequest struct {
	Title     string `json:"title" binding:"required"`
	SortOrder int    `json:"sort_order"`
}

type updateTodoItemRequest struct {
	Title     string `json:"title"`
	Done      bool   `json:"done"`
	SortOrder int    `json:"sort_order"`
}

func (h *TodoItemHandler) ListByTodo(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	items, err := h.svc.ListByTodo(c.Request.Context(), userID, workspaceID, uint(todoID))
	if err != nil {
		response.NotFound(c, "todo not found")
		return
	}
	if items == nil {
		items = []model.TodoItem{}
	}
	response.OK(c, items)
}

func (h *TodoItemHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo id")
		return
	}

	var req createTodoItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	item := &model.TodoItem{Title: req.Title, SortOrder: req.SortOrder}
	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, uint(todoID), item)
	if err != nil {
		if err == service.ErrTodoNotFound {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to create todo item")
		return
	}
	response.Created(c, result)
}

func (h *TodoItemHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("iid"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo item id")
		return
	}

	var req updateTodoItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := &model.TodoItem{Title: req.Title, Done: req.Done, SortOrder: req.SortOrder}
	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), updates)
	if err != nil {
		if err == service.ErrTodoItemNotFound {
			response.NotFound(c, "todo item not found")
			return
		}
		response.InternalError(c, "failed to update todo item")
		return
	}
	response.OK(c, result)
}

func (h *TodoItemHandler) Toggle(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("iid"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo item id")
		return
	}

	result, err := h.svc.Toggle(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		if err == service.ErrTodoItemNotFound {
			response.NotFound(c, "todo item not found")
			return
		}
		response.InternalError(c, "failed to toggle todo item")
		return
	}
	response.OK(c, result)
}

func (h *TodoItemHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("iid"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo item id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "todo item not found")
		return
	}
	response.OK(c, nil)
}
