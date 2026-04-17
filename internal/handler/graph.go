package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type GraphHandler struct {
	relationSvc *service.RelationService
}

func NewGraphHandler(relationSvc *service.RelationService) *GraphHandler {
	return &GraphHandler{relationSvc: relationSvc}
}

type createRelationRequest struct {
	ContactIDB   uint   `json:"contact_id_b" binding:"required"`
	RelationType string `json:"relation_type"`
}

func (h *GraphHandler) GetGraph(c *gin.Context) {
	userID := middleware.GetUserID(c)
	data, err := h.relationSvc.GetGraphData(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to get graph data")
		return
	}
	response.OK(c, data)
}

func (h *GraphHandler) GetRelations(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	relations, err := h.relationSvc.ListByContact(c.Request.Context(), userID, uint(contactID))
	if err != nil {
		response.InternalError(c, "failed to list relations")
		return
	}

	response.OK(c, relations)
}

func (h *GraphHandler) CreateRelation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactIDA, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req createRelationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	relation := &model.ContactRelation{
		ContactIDB:   req.ContactIDB,
		RelationType: req.RelationType,
	}

	result, err := h.relationSvc.Create(c.Request.Context(), userID, uint(contactIDA), relation)
	if err != nil {
		response.InternalError(c, "failed to create relation")
		return
	}

	response.Created(c, result)
}

func (h *GraphHandler) DeleteRelation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid relation id")
		return
	}

	if err := h.relationSvc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "relation not found")
		return
	}

	response.OK(c, nil)
}
