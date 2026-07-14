package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type HabitHandler struct {
	svc *service.HabitService
}

func NewHabitHandler(svc *service.HabitService) *HabitHandler {
	return &HabitHandler{svc: svc}
}

type createHabitRequest struct {
	Name      string `json:"name" binding:"required"`
	Color     string `json:"color"`
	Emoji     string `json:"emoji"`
	Frequency string `json:"frequency"`
	SortOrder int    `json:"sort_order"`
}

type updateHabitRequest struct {
	Name      string `json:"name"`
	Color     string `json:"color"`
	Emoji     string `json:"emoji"`
	Frequency string `json:"frequency"`
	Archived  *bool  `json:"archived"`
	SortOrder int    `json:"sort_order"`
}

func (h *HabitHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	includeArchived := c.Query("archived") == "true"

	habits, err := h.svc.List(c.Request.Context(), userID, workspaceID, includeArchived)
	if err != nil {
		response.InternalError(c, "failed to list habits")
		return
	}
	if habits == nil {
		habits = []model.Habit{}
	}
	response.OK(c, habits)
}

func (h *HabitHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req createHabitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	habit := &model.Habit{Name: req.Name, Color: req.Color, Emoji: req.Emoji, Frequency: req.Frequency, SortOrder: req.SortOrder}
	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, habit)
	if err != nil {
		response.InternalError(c, "failed to create habit")
		return
	}
	response.Created(c, result)
}

func (h *HabitHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid habit id")
		return
	}
	var req updateHabitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	updates := &model.Habit{Name: req.Name, Color: req.Color, Emoji: req.Emoji, Frequency: req.Frequency, SortOrder: req.SortOrder}
	if req.Archived != nil {
		updates.Archived = *req.Archived
	}
	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), updates)
	if err != nil {
		if err == service.ErrHabitNotFound {
			response.NotFound(c, "habit not found")
			return
		}
		response.InternalError(c, "failed to update habit")
		return
	}
	response.OK(c, result)
}

func (h *HabitHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid habit id")
		return
	}
	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "habit not found")
		return
	}
	response.OK(c, nil)
}

// CheckIn toggles a habit check-in for a date (?date=YYYY-MM-DD, default today).
func (h *HabitHandler) CheckIn(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid habit id")
		return
	}
	date := c.Query("date")
	checked, err := h.svc.Toggle(c.Request.Context(), userID, workspaceID, uint(id), date)
	if err != nil {
		if err == service.ErrHabitNotFound {
			response.NotFound(c, "habit not found")
			return
		}
		response.InternalError(c, "failed to check in")
		return
	}
	response.OK(c, gin.H{"checked": checked})
}
