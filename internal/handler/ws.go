package handler

import (
	"context"
	"errors"
	"strconv"

	"github.com/coder/websocket"

	"github.com/din4e/cuddlegecko/internal/realtime"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

// WSHandler upgrades browser WebSocket connections for real-time todo sync.
// Browsers cannot set an Authorization header on the WS handshake, so identity
// and workspace are taken from the query string (?token=...&workspace_id=...)
// using the same JWT validation and workspace-membership checks as the REST API.
type WSHandler struct {
	hub     *realtime.Hub
	jwtCfg  *config.JWTConfig
	checker middleware.WorkspaceMemberChecker
	origin  []string // allowed Origin host patterns; ["*"] disables the check
}

// NewWSHandler builds a WS handler. In non-release mode it accepts any Origin
// (mirroring the debug CORS policy); in release mode it restricts to the
// configured allow-origins.
func NewWSHandler(hub *realtime.Hub, jwtCfg *config.JWTConfig, checker middleware.WorkspaceMemberChecker, mode string, allowOrigins []string) *WSHandler {
	origin := allowOrigins
	if mode != gin.ReleaseMode {
		origin = []string{"*"}
	}
	return &WSHandler{hub: hub, jwtCfg: jwtCfg, checker: checker, origin: origin}
}

// Connect authenticates the upgrade, resolves the workspace, accepts the socket,
// and runs the connection pumps for the socket's lifetime.
func (h *WSHandler) Connect(c *gin.Context) {
	userID, err := middleware.ParseAccessToken(c.Query("token"), h.jwtCfg)
	if err != nil {
		response.Unauthorized(c, "invalid or missing token")
		return
	}

	ctx := c.Request.Context()
	workspaceID, err := h.resolveWorkspace(ctx, userID, c.Query("workspace_id"))
	if err != nil {
		response.Forbidden(c, err.Error())
		return
	}

	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		OriginPatterns: h.origin,
	})
	if err != nil {
		// websocket.Accept already wrote an HTTP error response on failure.
		return
	}

	realtime.ServeWS(ctx, h.hub, conn, workspaceID)
}

// resolveWorkspace mirrors the WorkspaceAuth middleware: an explicit id from the
// query (verified for membership), else the user's default workspace.
func (h *WSHandler) resolveWorkspace(ctx context.Context, userID uint, raw string) (uint, error) {
	if raw != "" {
		id, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			return 0, errors.New("invalid workspace id")
		}
		wsID := uint(id)
		if !h.checker.IsMember(ctx, wsID, userID) {
			return 0, errors.New("not a member of this workspace")
		}
		return wsID, nil
	}
	wsID, err := h.checker.GetDefaultWorkspaceID(ctx, userID)
	if err != nil {
		return 0, errors.New("no workspace available")
	}
	return wsID, nil
}
