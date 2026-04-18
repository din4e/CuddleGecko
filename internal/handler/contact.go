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

type ContactHandler struct {
	svc *service.ContactService
}

func NewContactHandler(svc *service.ContactService) *ContactHandler {
	return &ContactHandler{svc: svc}
}

type createContactRequest struct {
	Name               string     `json:"name" binding:"required"`
	Nickname           string     `json:"nickname"`
	AvatarEmoji        string     `json:"avatar_emoji"`
	AvatarURL          string     `json:"avatar_url"`
	Phone              []string   `json:"phones"`
	Email              []string   `json:"emails"`
	Birthday           *time.Time `json:"birthday"`
	Notes              string     `json:"notes"`
	RelationshipLabels []string   `json:"relationship_labels"`
}

type updateContactRequest struct {
	Name               string     `json:"name"`
	Nickname           string     `json:"nickname"`
	AvatarEmoji        string     `json:"avatar_emoji"`
	AvatarURL          string     `json:"avatar_url"`
	Phone              []string   `json:"phones"`
	Email              []string   `json:"emails"`
	Birthday           *time.Time `json:"birthday"`
	Notes              string     `json:"notes"`
	RelationshipLabels []string   `json:"relationship_labels"`
}

type replaceTagsRequest struct {
	TagIDs []uint `json:"tag_ids" binding:"required"`
}

func (h *ContactHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	search := c.Query("search")

	var tagIDs []uint
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := strconv.ParseUint(idStr, 10, 32); err == nil {
			tagIDs = append(tagIDs, uint(id))
		}
	}

	contacts, total, err := h.svc.List(c.Request.Context(), userID, page, pageSize, search, tagIDs)
	if err != nil {
		response.InternalError(c, "failed to list contacts")
		return
	}

	response.OKPaginated(c, contacts, total, page, pageSize)
}

func (h *ContactHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	contact := &model.Contact{
		Name:               req.Name,
		Nickname:           req.Nickname,
		AvatarEmoji:        req.AvatarEmoji,
		AvatarURL:          req.AvatarURL,
		Phone:              req.Phone,
		Email:              req.Email,
		Birthday:           req.Birthday,
		Notes:              req.Notes,
		RelationshipLabels: req.RelationshipLabels,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, contact)
	if err != nil {
		response.InternalError(c, "failed to create contact")
		return
	}

	response.Created(c, result)
}

func (h *ContactHandler) GetByID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	contact, err := h.svc.GetByID(c.Request.Context(), userID, uint(id))
	if err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, contact)
}

func (h *ContactHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req updateContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	contact := &model.Contact{
		Name:               req.Name,
		Nickname:           req.Nickname,
		AvatarEmoji:        req.AvatarEmoji,
		AvatarURL:          req.AvatarURL,
		Phone:              req.Phone,
		Email:              req.Email,
		Birthday:           req.Birthday,
		Notes:              req.Notes,
		RelationshipLabels: req.RelationshipLabels,
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), contact)
	if err != nil {
		if err == service.ErrContactNotFound {
			response.NotFound(c, "contact not found")
			return
		}
		response.InternalError(c, "failed to update contact")
		return
	}

	response.OK(c, result)
}

func (h *ContactHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, nil)
}

func (h *ContactHandler) GetTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	tags, err := h.svc.GetTags(c.Request.Context(), userID, uint(id))
	if err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, tags)
}

func (h *ContactHandler) ReplaceTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req replaceTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReplaceTags(c.Request.Context(), userID, uint(id), req.TagIDs); err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, nil)
}
