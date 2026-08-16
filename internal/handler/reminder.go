package handler

import (
	"errors"
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type ReminderHandler struct {
	svc *service.ReminderService
}

func NewReminderHandler(svc *service.ReminderService) *ReminderHandler {
	return &ReminderHandler{svc: svc}
}

type createReminderRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	RemindAt    string `json:"remind_at" binding:"required"`
}

type updateReminderRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	RemindAt    string `json:"remind_at"`
	Status      string `json:"status" binding:"omitempty,oneof=pending done snoozed"`
}

func (h *ReminderHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	status := model.ReminderStatus(c.Query("status"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	var contactID *uint
	if v := c.Query("contact_id"); v != "" {
		if id, err := strconv.ParseUint(v, 10, 32); err == nil {
			uid := uint(id)
			contactID = &uid
		}
	}

	reminders, total, err := h.svc.List(c.Request.Context(), userID, workspaceID, status, contactID, page, pageSize)
	if err != nil {
		response.InternalError(c, "failed to list reminders")
		return
	}

	response.OKPaginated(c, reminders, total, page, pageSize)
}

func (h *ReminderHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req createReminderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	reminder := &model.Reminder{
		Title:       req.Title,
		Description: req.Description,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, uint(contactID), reminder)
	if err != nil {
		response.InternalError(c, "failed to create reminder")
		return
	}

	response.Created(c, result)
}

func (h *ReminderHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid reminder id")
		return
	}

	var req updateReminderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := &model.Reminder{
		Title:       req.Title,
		Description: req.Description,
		Status:      model.ReminderStatus(req.Status),
	}

	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), updates)
	if err != nil {
		if err == service.ErrReminderNotFound {
			response.NotFound(c, "reminder not found")
			return
		}
		if errors.Is(err, service.ErrInvalidReminder) {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to update reminder")
		return
	}

	response.OK(c, result)
}

func (h *ReminderHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid reminder id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "reminder not found")
		return
	}

	response.OK(c, nil)
}
