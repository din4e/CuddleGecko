package handler

import (
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
	ContactIDB   string `json:"contact_id_b" binding:"required"`
	RelationType string `json:"relation_type"`
}

func (h *GraphHandler) GetGraph(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	data, err := h.relationSvc.GetGraphData(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to get graph data")
		return
	}
	response.OK(c, data)
}

func (h *GraphHandler) GetRelations(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	contactID := c.Param("id")

	relations, err := h.relationSvc.ListByContact(c.Request.Context(), userID, workspaceID, contactID)
	if err != nil {
		response.InternalError(c, "failed to list relations")
		return
	}

	response.OK(c, relations)
}

func (h *GraphHandler) CreateRelation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	contactIDA := c.Param("id")

	var req createRelationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	relation := &model.ContactRelation{
		ContactIDB:   req.ContactIDB,
		RelationType: req.RelationType,
	}

	result, err := h.relationSvc.Create(c.Request.Context(), userID, workspaceID, contactIDA, relation)
	if err != nil {
		response.InternalError(c, "failed to create relation")
		return
	}

	response.Created(c, result)
}

func (h *GraphHandler) DeleteRelation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id := c.Param("id")

	if err := h.relationSvc.Delete(c.Request.Context(), userID, workspaceID, id); err != nil {
		response.NotFound(c, "relation not found")
		return
	}

	response.OK(c, nil)
}
