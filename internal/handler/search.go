package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type SearchHandler struct {
	svc *service.SearchService
}

func NewSearchHandler(svc *service.SearchService) *SearchHandler {
	return &SearchHandler{svc: svc}
}

// Search handles GET /api/search?q=&types=contact,todo&limit=10 — one query
// fanned out across every entity type (empty types = all).
func (h *SearchHandler) Search(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	query := strings.TrimSpace(c.Query("q"))

	var types []string
	if raw := c.Query("types"); raw != "" {
		types = strings.Split(raw, ",")
	}

	limit := 0
	if raw := c.Query("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil {
			limit = v
		}
	}

	results, err := h.svc.Search(c.Request.Context(), userID, workspaceID, query, types, limit)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidSearchQuery):
			response.BadRequest(c, err.Error())
		case errors.Is(err, service.ErrInvalidSearchType):
			response.BadRequest(c, err.Error())
		default:
			response.InternalError(c, "failed to search")
		}
		return
	}

	response.OK(c, results)
}
