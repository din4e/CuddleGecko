package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type InteractionHandler struct {
	svc *service.InteractionService
}

func NewInteractionHandler(svc *service.InteractionService) *InteractionHandler {
	return &InteractionHandler{svc: svc}
}

type createInteractionRequest struct {
	Type       model.InteractionType `json:"type" binding:"required"`
	Title      string                `json:"title" binding:"required"`
	Content    string                `json:"content"`
	OccurredAt string                `json:"occurred_at" binding:"required"`
}

type updateInteractionRequest struct {
	Type       model.InteractionType `json:"type"`
	Title      string                `json:"title"`
	Content    string                `json:"content"`
	OccurredAt string                `json:"occurred_at"`
}

func (h *InteractionHandler) ListByContact(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	interactions, total, err := h.svc.ListByContact(c.Request.Context(), userID, uint(contactID), page, pageSize)
	if err != nil {
		response.InternalError(c, "failed to list interactions")
		return
	}

	response.OKPaginated(c, interactions, total, page, pageSize)
}

func (h *InteractionHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req createInteractionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	interaction := &model.Interaction{
		Type:    req.Type,
		Title:   req.Title,
		Content: req.Content,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, uint(contactID), interaction)
	if err != nil {
		response.InternalError(c, "failed to create interaction")
		return
	}

	response.Created(c, result)
}

func (h *InteractionHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid interaction id")
		return
	}

	var req updateInteractionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	interaction := &model.Interaction{
		Type:    req.Type,
		Title:   req.Title,
		Content: req.Content,
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), interaction)
	if err != nil {
		if err == service.ErrInteractionNotFound {
			response.NotFound(c, "interaction not found")
			return
		}
		response.InternalError(c, "failed to update interaction")
		return
	}

	response.OK(c, result)
}

func (h *InteractionHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid interaction id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "interaction not found")
		return
	}

	response.OK(c, nil)
}
