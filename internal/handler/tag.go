package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type TagHandler struct {
	svc *service.TagService
}

func NewTagHandler(svc *service.TagService) *TagHandler {
	return &TagHandler{svc: svc}
}

type createTagRequest struct {
	Name  string `json:"name" binding:"required"`
	Color string `json:"color"`
}

type updateTagRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (h *TagHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tags, err := h.svc.List(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to list tags")
		return
	}
	response.OK(c, tags)
}

func (h *TagHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	tag, err := h.svc.Create(c.Request.Context(), userID, &model.Tag{
		Name:  req.Name,
		Color: req.Color,
	})
	if err != nil {
		response.InternalError(c, "failed to create tag")
		return
	}

	response.Created(c, tag)
}

func (h *TagHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid tag id")
		return
	}

	var req updateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	tag, err := h.svc.Update(c.Request.Context(), userID, uint(id), &model.Tag{
		Name:  req.Name,
		Color: req.Color,
	})
	if err != nil {
		response.NotFound(c, "tag not found")
		return
	}

	response.OK(c, tag)
}

func (h *TagHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid tag id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "tag not found")
		return
	}

	response.OK(c, nil)
}
