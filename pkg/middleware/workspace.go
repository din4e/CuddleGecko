package middleware

import (
	"context"
	"strconv"

	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type WorkspaceMemberChecker interface {
	IsMember(ctx context.Context, workspaceID, userID uint) bool
	GetDefaultWorkspaceID(ctx context.Context, userID uint) (uint, error)
}

func WorkspaceAuth(checker WorkspaceMemberChecker) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == 0 {
			response.Unauthorized(c, "missing user context")
			c.Abort()
			return
		}

		ctx := c.Request.Context()
		headerVal := c.GetHeader("X-Workspace-ID")
		var workspaceID uint

		if headerVal != "" {
			id, err := strconv.ParseUint(headerVal, 10, 32)
			if err != nil {
				response.BadRequest(c, "invalid workspace id")
				c.Abort()
				return
			}
			workspaceID = uint(id)
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

func GetWorkspaceID(c *gin.Context) uint {
	return c.GetUint("workspace_id")
}
