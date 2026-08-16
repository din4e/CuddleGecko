package middleware

import (
	"net/http"
	"slices"

	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/gin-gonic/gin"
)

func CORS(cfg *config.CORSConfig, mode string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowOrigin := ""

		if mode == gin.ReleaseMode {
			if slices.Contains(cfg.AllowOrigins, origin) {
				allowOrigin = origin
			}
		} else {
			allowOrigin = "*"
		}

		if allowOrigin != "" {
			c.Header("Access-Control-Allow-Origin", allowOrigin)
			// The origin is reflected per-request; without Vary a shared
			// proxy/CDN could cache one origin's response for another.
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,Mcp-Session-Id")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
