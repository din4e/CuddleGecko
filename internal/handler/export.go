package handler

import (
	"strings"

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

	json, err := h.svc.ExportJSON(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to export")
		return
	}
	response.OK(c, json)
}

type moduleExportRequest struct {
	Format string `json:"format"` // csv | json (default json)
}

type moduleImportRequest struct {
	Data   string `json:"data" binding:"required"`
	Format string `json:"format"` // csv | json (default csv)
}

// ExportModule exports a single module (contacts, todos, …) as CSV or JSON.
// The module name is validated by the service against its registry.
func (h *ExportHandler) ExportModule(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	module := c.Param("module")

	var req moduleExportRequest
	_ = c.ShouldBindJSON(&req) // body optional; default json
	format := strings.ToLower(strings.TrimSpace(req.Format))
	if format == "" {
		format = "json"
	}

	var out string
	var err error
	switch format {
	case "json":
		out, err = h.svc.ExportModuleJSON(c.Request.Context(), userID, workspaceID, module)
	case "csv":
		out, err = h.svc.ExportModuleCSV(c.Request.Context(), workspaceID, module)
	default:
		response.BadRequest(c, "format must be csv or json")
		return
	}
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, out)
}

// ImportModule imports a single module from CSV or JSON. CSV imports dedup on
// the module's key fields and report {imported, skipped}.
func (h *ExportHandler) ImportModule(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	module := c.Param("module")

	var req moduleImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	format := strings.ToLower(strings.TrimSpace(req.Format))
	if format == "" {
		format = "csv"
	}

	switch format {
	case "csv":
		stats, err := h.svc.ImportModuleCSV(c.Request.Context(), userID, workspaceID, module, req.Data)
		if err != nil {
			response.BadRequest(c, err.Error())
			return
		}
		response.OK(c, stats)
	case "json":
		stats, err := h.svc.ImportModuleJSON(c.Request.Context(), userID, workspaceID, module, req.Data)
		if err != nil {
			response.BadRequest(c, err.Error())
			return
		}
		response.OK(c, stats)
	default:
		response.BadRequest(c, "format must be csv or json")
	}
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

	stats, err := h.svc.ImportTodosCSV(c.Request.Context(), userID, workspaceID, req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, stats)
}

// ImportTodosFromPlatform imports an external-platform todo backup (e.g. a
// 滴答清单/TickTick CSV). The platform comes from the URL so new sources only
// need a service-side parser registration.
func (h *ExportHandler) ImportTodosFromPlatform(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req importRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	res, err := h.svc.ImportTodosFromPlatform(c.Request.Context(), userID, workspaceID, c.Param("platform"), req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, res)
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

	stats, err := h.svc.ImportContactsCSV(c.Request.Context(), userID, workspaceID, req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, stats)
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

	stats, err := h.svc.ImportTransactionsCSV(c.Request.Context(), userID, workspaceID, req.Data)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, stats)
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
