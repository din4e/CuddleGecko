package handler

import (
	"errors"
	"strconv"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

// --- Per-todo comments (markdown notes) ---

type createTodoCommentRequest struct {
	Content string `json:"content" binding:"required"`
}

type updateTodoCommentRequest struct {
	Content string `json:"content" binding:"required"`
}

func (h *TodoHandler) parseTodoCommentID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("commentId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid todo comment id")
		return 0, false
	}
	return uint(id), true
}

// ListComments returns a todo's notes, oldest first.
func (h *TodoHandler) ListComments(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	comments, err := h.svc.ListComments(c.Request.Context(), userID, workspaceID, todoID)
	if err != nil {
		if errors.Is(err, service.ErrTodoNotFound) {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to list todo comments")
		return
	}

	response.OK(c, comments)
}

// CreateComment appends a markdown note to a todo.
func (h *TodoHandler) CreateComment(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}

	var req createTodoCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	comment, err := h.svc.CreateComment(c.Request.Context(), userID, workspaceID, todoID, req.Content)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTodoNotFound):
			response.NotFound(c, "todo not found")
		case errors.Is(err, service.ErrTodoCommentEmpty):
			response.BadRequest(c, err.Error())
		default:
			response.InternalError(c, "failed to create todo comment")
		}
		return
	}

	response.Created(c, comment)
}

// UpdateComment edits the author's own note.
func (h *TodoHandler) UpdateComment(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	commentID, ok := h.parseTodoCommentID(c)
	if !ok {
		return
	}

	var req updateTodoCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	comment, err := h.svc.UpdateComment(c.Request.Context(), userID, workspaceID, todoID, commentID, req.Content)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTodoNotFound):
			response.NotFound(c, "todo not found")
		case errors.Is(err, service.ErrTodoCommentNotFound):
			response.NotFound(c, "todo comment not found")
		case errors.Is(err, service.ErrTodoCommentEmpty):
			response.BadRequest(c, err.Error())
		case errors.Is(err, service.ErrTodoCommentNotAllowed):
			response.Forbidden(c, err.Error())
		default:
			response.InternalError(c, "failed to update todo comment")
		}
		return
	}

	response.OK(c, comment)
}

// DeleteComment removes the author's own note.
func (h *TodoHandler) DeleteComment(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	commentID, ok := h.parseTodoCommentID(c)
	if !ok {
		return
	}

	if err := h.svc.DeleteComment(c.Request.Context(), userID, workspaceID, todoID, commentID); err != nil {
		switch {
		case errors.Is(err, service.ErrTodoNotFound):
			response.NotFound(c, "todo not found")
		case errors.Is(err, service.ErrTodoCommentNotFound):
			response.NotFound(c, "todo comment not found")
		case errors.Is(err, service.ErrTodoCommentNotAllowed):
			response.Forbidden(c, err.Error())
		default:
			response.InternalError(c, "failed to delete todo comment")
		}
		return
	}

	response.OK(c, nil)
}

// ListActivities returns the todo's audit log (who changed what, when).
func (h *TodoHandler) ListActivities(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	todoID, ok := h.parseTodoID(c)
	if !ok {
		return
	}
	limit := 200
	if raw := c.Query("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}

	activities, err := h.svc.ListActivities(c.Request.Context(), userID, workspaceID, todoID, limit)
	if err != nil {
		if errors.Is(err, service.ErrTodoNotFound) {
			response.NotFound(c, "todo not found")
			return
		}
		response.InternalError(c, "failed to list todo activities")
		return
	}

	response.OK(c, activities)
}
