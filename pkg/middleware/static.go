package middleware

import (
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// StaticPathCheck rejects path-traversal attempts before gin's Static handler
// runs. c.Param("filepath") on a Static wildcard carries a leading slash and
// does NOT include the route prefix, so the previous filepath.Clean+IsAbs
// check rejected EVERY request (avatars were 100% unservable). Anchoring at
// "/" makes path.Clean unable to produce a surviving "..", and gin serves via
// http.Dir which independently root-prefix-checks — so here we reject any raw
// input still containing traversal/NUL sequences and allow the rest.
func StaticPathCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.Param("filepath")
		if raw == "" {
			raw = c.Request.URL.Path
		}
		cleaned := path.Clean("/" + raw)
		if strings.Contains(raw, "..") || strings.Contains(raw, "\x00") || !strings.HasPrefix(cleaned, "/") {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	}
}
