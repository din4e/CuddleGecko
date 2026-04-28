package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type WorkspaceHandler struct {
	svc *service.WorkspaceService
}

func NewWorkspaceHandler(svc *service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{svc: svc}
}

type createWorkspaceRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

type updateWorkspaceRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

func (h *WorkspaceHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaces, err := h.svc.List(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to list workspaces")
		return
	}
	response.OK(c, workspaces)
}

func (h *WorkspaceHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	ws, err := h.svc.Create(c.Request.Context(), userID, req.Name, req.Description, req.Icon)
	if err != nil {
		response.InternalError(c, "failed to create workspace")
		return
	}
	response.Created(c, ws)
}

func (h *WorkspaceHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid workspace id")
		return
	}

	var req updateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	ws, err := h.svc.Update(c.Request.Context(), userID, uint(id), req.Name, req.Description, req.Icon)
	if err != nil {
		if err == service.ErrWorkspaceNotFound {
			response.NotFound(c, "workspace not found")
			return
		}
		if err == service.ErrNotWorkspaceOwner {
			response.Forbidden(c, err.Error())
			return
		}
		response.InternalError(c, "failed to update workspace")
		return
	}
	response.OK(c, ws)
}

func (h *WorkspaceHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid workspace id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		if err == service.ErrWorkspaceNotFound {
			response.NotFound(c, "workspace not found")
			return
		}
		if err == service.ErrNotWorkspaceOwner {
			response.Forbidden(c, err.Error())
			return
		}
		response.InternalError(c, "failed to delete workspace")
		return
	}
	response.OK(c, nil)
}

func (h *WorkspaceHandler) Switch(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid workspace id")
		return
	}

	ws, err := h.svc.Switch(c.Request.Context(), userID, uint(id))
	if err != nil {
		if err == service.ErrNotWorkspaceMember || err == service.ErrWorkspaceNotFound {
			response.NotFound(c, "workspace not found")
			return
		}
		response.InternalError(c, "failed to switch workspace")
		return
	}
	response.OK(c, ws)
}

func (h *WorkspaceHandler) GetDefault(c *gin.Context) {
	userID := middleware.GetUserID(c)
	ws, err := h.svc.GetDefaultWorkspace(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "no default workspace")
		return
	}
	response.OK(c, ws)
}
