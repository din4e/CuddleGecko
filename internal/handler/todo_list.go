package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type TodoListHandler struct {
	svc *service.TodoListService
}

func NewTodoListHandler(svc *service.TodoListService) *TodoListHandler {
	return &TodoListHandler{svc: svc}
}

type createTodoListRequest struct {
	Name      string `json:"name" binding:"required"`
	Color     string `json:"color"`
	SortOrder int    `json:"sort_order"`
}

type updateTodoListRequest struct {
	Name      string `json:"name"`
	Color     string `json:"color"`
	SortOrder int    `json:"sort_order"`
}

func (h *TodoListHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	lists, err := h.svc.List(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list todo lists")
		return
	}
	if lists == nil {
		lists = []model.TodoList{}
	}
	response.OK(c, lists)
}

func (h *TodoListHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req createTodoListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	list := &model.TodoList{Name: req.Name, Color: req.Color, SortOrder: req.SortOrder}
	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, list)
	if err != nil {
		response.InternalError(c, "failed to create todo list")
		return
	}
	response.Created(c, result)
}

func (h *TodoListHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo list id")
		return
	}

	var req updateTodoListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := &model.TodoList{Name: req.Name, Color: req.Color, SortOrder: req.SortOrder}
	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), updates)
	if err != nil {
		if err == service.ErrTodoListNotFound {
			response.NotFound(c, "todo list not found")
			return
		}
		response.InternalError(c, "failed to update todo list")
		return
	}
	response.OK(c, result)
}

func (h *TodoListHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo list id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "todo list not found")
		return
	}
	response.OK(c, nil)
}
