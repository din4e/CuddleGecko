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

// ExportTodosCSV returns the workspace's todos as a CSV string (for spreadsheet
// export). Returned via the standard envelope; the client wraps it as a Blob.
func (h *ExportHandler) ExportTodosCSV(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	csv, err := h.svc.ExportTodosCSV(c.Request.Context(), workspaceID)
	if err != nil {
		response.InternalError(c, "failed to export csv")
		return
	}
	response.OK(c, csv)
}

// ExportContactsCSV returns the workspace's contacts as a CSV string.
func (h *ExportHandler) ExportContactsCSV(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	csv, err := h.svc.ExportContactsCSV(c.Request.Context(), workspaceID)
	if err != nil {
		response.InternalError(c, "failed to export contacts csv")
		return
	}
	response.OK(c, csv)
}

// ExportTransactionsCSV returns the workspace's transactions as a CSV string.
func (h *ExportHandler) ExportTransactionsCSV(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	csv, err := h.svc.ExportTransactionsCSV(c.Request.Context(), workspaceID)
	if err != nil {
		response.InternalError(c, "failed to export transactions csv")
		return
	}
	response.OK(c, csv)
}

// ExportEventsCSV returns the workspace's calendar events as a CSV string.
func (h *ExportHandler) ExportEventsCSV(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	csv, err := h.svc.ExportEventsCSV(c.Request.Context(), workspaceID)
	if err != nil {
		response.InternalError(c, "failed to export events csv")
		return
	}
	response.OK(c, csv)
}

// ImportTodosCSV creates a flat todo per CSV row.
func (h *ExportHandler) ImportTodosCSV(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req importRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	n, err := h.svc.ImportTodosCSV(c.Request.Context(), userID, workspaceID, req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, gin.H{"imported": n})
}

// ImportContactsCSV creates a contact per CSV row.
func (h *ExportHandler) ImportContactsCSV(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req importRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	n, err := h.svc.ImportContactsCSV(c.Request.Context(), userID, workspaceID, req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, gin.H{"imported": n})
}

// ImportTransactionsCSV creates a transaction per CSV row.
func (h *ExportHandler) ImportTransactionsCSV(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req importRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	n, err := h.svc.ImportTransactionsCSV(c.Request.Context(), userID, workspaceID, req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, gin.H{"imported": n})
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
