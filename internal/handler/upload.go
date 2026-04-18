package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	uploadDir string
}

func NewUploadHandler(uploadDir string) *UploadHandler {
	os.MkdirAll(uploadDir, 0755)
	return &UploadHandler{uploadDir: uploadDir}
}

func (h *UploadHandler) UploadAvatar(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "no file provided")
		return
	}

	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".png"
	}
	// Only allow image extensions
	allowed := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true}
	if !allowed[ext] {
		response.BadRequest(c, "only image files are allowed (png, jpg, gif, webp)")
		return
	}

	filename := fmt.Sprintf("%d_%d%s", time.Now().UnixMilli(), c.GetInt("user_id"), ext)
	dst := filepath.Join(h.uploadDir, filename)

	if err := c.SaveUploadedFile(file, dst); err != nil {
		response.InternalError(c, "failed to save file")
		return
	}

	response.OK(c, gin.H{
		"url": "/avatars/" + filename,
	})
}
