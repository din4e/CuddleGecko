package middleware

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// StaticPathCheck rejects requests with path traversal sequences or absolute paths.
func StaticPathCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Param("filepath")
		if path == "" {
			path = c.Request.URL.Path
		}
		cleaned := filepath.Clean(path)
		if strings.Contains(cleaned, "..") || filepath.IsAbs(cleaned) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	}
}
