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
var defaultNavOrder = []string{"/graph", "/events", "/todos", "/finance", "/ai", "/tags", "/reminders"}

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
