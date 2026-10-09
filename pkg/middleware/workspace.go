package middleware

import (
	"context"

	"github.com/google/uuid"

	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type WorkspaceMemberChecker interface {
	IsMember(ctx context.Context, workspaceID, userID string) bool
	GetDefaultWorkspaceID(ctx context.Context, userID string) (string, error)
}

func WorkspaceAuth(checker WorkspaceMemberChecker) gin.HandlerFunc {
	// Cache IsMember results (short TTL) so the per-request membership COUNT
	// only hits the DB once per member every memberTTL. Wrapped here so every
	// caller gets caching transparently, with no wiring changes.
	checker = NewCachingWorkspaceChecker(checker, memberTTL)
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == "" {
			response.Unauthorized(c, "missing user context")
			c.Abort()
			return
		}

		ctx := c.Request.Context()
		headerVal := c.GetHeader("X-Workspace-ID")
		var workspaceID string

		// Only a well-formed UUID header selects a workspace; anything else
		// (empty, or a stale pre-uuid integer left in a browser's localStorage)
		// falls back to the user's default so clients self-heal instead of
		// seeing a wall of 403s after the id migration.
		if headerVal != "" && uuid.Validate(headerVal) == nil {
			workspaceID = headerVal
		} else {
			wsID, err := checker.GetDefaultWorkspaceID(ctx, userID)
			if err != nil {
				response.BadRequest(c, "no workspace available")
				c.Abort()
				return
			}
			workspaceID = wsID
		}

		if !checker.IsMember(ctx, workspaceID, userID) {
			response.Forbidden(c, "not a member of this workspace")
			c.Abort()
			return
		}

		c.Set("workspace_id", workspaceID)
		c.Next()
	}
}

func GetWorkspaceID(c *gin.Context) string {
	return c.GetString("workspace_id")
}
