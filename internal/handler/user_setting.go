package handler

import (
	"encoding/json"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

const navSettingKey = "nav"

// defaultNavOrder is the default sidebar order for customizable nav items (by route path).
var defaultNavOrder = []string{"/graph", "/events", "/todos", "/fitness", "/finance", "/ai", "/tags", "/reminders"}

type UserSettingHandler struct {
	svc *service.UserSettingService
}

func NewUserSettingHandler(svc *service.UserSettingService) *UserSettingHandler {
	return &UserSettingHandler{svc: svc}
}

type navConfigResponse struct {
	Order  []string `json:"order"`
	Hidden []string `json:"hidden"`
}

type navConfigRequest struct {
	Order  []string `json:"order"`
	Hidden []string `json:"hidden"`
}

// GetNav returns the current user's sidebar nav layout (order + hidden items).
func (h *UserSettingHandler) GetNav(c *gin.Context) {
	userID := middleware.GetUserID(c)
	out := navConfigResponse{Order: defaultNavOrder, Hidden: []string{}}
	val, found, err := h.svc.Get(c.Request.Context(), userID, navSettingKey)
	if err == nil && found {
		var stored navConfigResponse
		if json.Unmarshal([]byte(val), &stored) == nil {
			if len(stored.Order) > 0 {
				out.Order = stored.Order
			}
			if stored.Hidden != nil {
				out.Hidden = stored.Hidden
			}
		}
	}
	response.OK(c, out)
}

// UpdateNav saves the current user's sidebar nav layout.
func (h *UserSettingHandler) UpdateNav(c *gin.Context) {
	var req navConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	userID := middleware.GetUserID(c)
	b, _ := json.Marshal(navConfigResponse{Order: req.Order, Hidden: req.Hidden})
	if err := h.svc.Set(c.Request.Context(), userID, navSettingKey, string(b)); err != nil {
		response.InternalError(c, "failed to save nav config")
		return
	}
	response.OK(c, navConfigResponse{Order: req.Order, Hidden: req.Hidden})
}

const kanbanSettingKey = "kanban"

// Kanban column config: each column is a saved predicate over todos
// (status / priority / tag). Stored as opaque JSON from the frontend; only
// structural validity is checked here.
type kanbanConfigRequest struct {
	Columns []kanbanColumn `json:"columns"`
}

type kanbanColumn struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`  // status | priority | tag
	Value string `json:"value"`
}

var validKanbanKinds = map[string]bool{"status": true, "priority": true, "tag": true}

// GetKanban returns the user's kanban column layout (default: pending/done).
func (h *UserSettingHandler) GetKanban(c *gin.Context) {
	userID := middleware.GetUserID(c)
	out := kanbanConfigRequest{Columns: []kanbanColumn{
		{ID: "status-pending", Label: "pending", Kind: "status", Value: "pending"},
		{ID: "status-done", Label: "done", Kind: "status", Value: "done"},
	}}
	val, found, err := h.svc.Get(c.Request.Context(), userID, kanbanSettingKey)
	if err == nil && found {
		var stored kanbanConfigRequest
		if json.Unmarshal([]byte(val), &stored) == nil && len(stored.Columns) > 0 {
			out = stored
		}
	}
	response.OK(c, out)
}

// UpdateKanban saves the user's kanban column layout.
func (h *UserSettingHandler) UpdateKanban(c *gin.Context) {
	var req kanbanConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if len(req.Columns) > 20 {
		response.BadRequest(c, "too many kanban columns")
		return
	}
	for _, col := range req.Columns {
		if !validKanbanKinds[col.Kind] || col.Value == "" || col.Label == "" || col.ID == "" {
			response.BadRequest(c, "invalid kanban column")
			return
		}
	}
	userID := middleware.GetUserID(c)
	b, _ := json.Marshal(req)
	if err := h.svc.Set(c.Request.Context(), userID, kanbanSettingKey, string(b)); err != nil {
		response.InternalError(c, "failed to save kanban config")
		return
	}
	response.OK(c, req)
}

const dashboardSettingKey = "dashboard"

// defaultDashboardOrder is the default order of customizable dashboard widgets.
var defaultDashboardOrder = []string{"stats", "quickActions", "events", "reminders", "todos", "trend"}

type dashboardConfigResponse struct {
	Order  []string `json:"order"`
	Hidden []string `json:"hidden"`
}

type dashboardConfigRequest struct {
	Order  []string `json:"order"`
	Hidden []string `json:"hidden"`
}

// GetDashboard returns the current user's dashboard widget layout (order + hidden).
func (h *UserSettingHandler) GetDashboard(c *gin.Context) {
	userID := middleware.GetUserID(c)
	out := dashboardConfigResponse{Order: defaultDashboardOrder, Hidden: []string{}}
	val, found, err := h.svc.Get(c.Request.Context(), userID, dashboardSettingKey)
	if err == nil && found {
		var stored dashboardConfigResponse
		if json.Unmarshal([]byte(val), &stored) == nil {
			if len(stored.Order) > 0 {
				out.Order = stored.Order
			}
			if stored.Hidden != nil {
				out.Hidden = stored.Hidden
			}
		}
	}
	response.OK(c, out)
}

// UpdateDashboard saves the current user's dashboard widget layout.
func (h *UserSettingHandler) UpdateDashboard(c *gin.Context) {
	var req dashboardConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	userID := middleware.GetUserID(c)
	b, _ := json.Marshal(dashboardConfigResponse{Order: req.Order, Hidden: req.Hidden})
	if err := h.svc.Set(c.Request.Context(), userID, dashboardSettingKey, string(b)); err != nil {
		response.InternalError(c, "failed to save dashboard config")
		return
	}
	response.OK(c, dashboardConfigResponse{Order: req.Order, Hidden: req.Hidden})
}
