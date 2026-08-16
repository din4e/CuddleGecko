package handler

import (
	"net/http"

	"github.com/din4e/cuddlegecko/internal/version"
	"github.com/gin-gonic/gin"
)

// VersionHandler serves the build version. Kept separate from the domain
// handlers so it has no service dependencies.
type VersionHandler struct{}

func NewVersionHandler() *VersionHandler {
	return &VersionHandler{}
}

// Get reports the build version (ldflags-stamped by the release workflow;
// "0.1.0-dev" for local builds) plus an HTTP-level liveness signal. Public —
// the version is not a secret, and uptime monitors need an unauthenticated
// probe. Also doubles as the docker/monitor healthcheck target.
func (h *VersionHandler) Get(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data":    gin.H{"version": version.Version},
	})
}
