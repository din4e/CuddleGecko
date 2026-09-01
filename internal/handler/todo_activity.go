package handler

import (
	"errors"
	"strconv"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

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
