package handler

import (
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type ExportHandler struct {
	svc *service.ExportService
}

func NewExportHandler(svc *service.ExportService) *ExportHandler {
	return &ExportHandler{svc: svc}
}

type importRequest struct {
	Data string `json:"data" binding:"required"`
}

func (h *ExportHandler) Export(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	_ = userID

	json, err := h.svc.ExportJSON(c.Request.Context(), workspaceID)
	if err != nil {
		response.InternalError(c, "failed to export")
		return
	}
	response.OK(c, json)
}

func (h *ExportHandler) Import(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req importRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ImportJSON(c.Request.Context(), userID, workspaceID, req.Data); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, nil)
}
