package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

const maxAvatarSize = 5 * 1024 * 1024 // 5MB

type UploadHandler struct {
	uploadDir string
}

func NewUploadHandler(uploadDir string) *UploadHandler {
	os.MkdirAll(uploadDir, 0755)
	return &UploadHandler{uploadDir: uploadDir}
}

func (h *UploadHandler) UploadAvatar(c *gin.Context) {
	// Cap the request body BEFORE parsing multipart — Go streams multipart
	// parts to temp files while parsing, so a multi-GB body would hit the
	// disk before the 5MB check below ever ran (disk-fill DoS).
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarSize+64*1024)

	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "no file provided")
		return
	}

	if file.Size > maxAvatarSize {
		response.BadRequest(c, "file too large (max 5MB)")
		return
	}

	opened, err := file.Open()
	if err != nil {
		response.InternalError(c, "failed to read file")
		return
	}
	defer opened.Close()

	if !validateImageHeader(opened) {
		response.BadRequest(c, "invalid image file")
		return
	}

	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".png"
	}
	ext = strings.ToLower(ext)
	allowed := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true}
	if !allowed[ext] {
		response.BadRequest(c, "only image files are allowed (png, jpg, gif, webp)")
		return
	}

	randomSuffix := make([]byte, 8)
	if _, err := rand.Read(randomSuffix); err != nil {
		response.InternalError(c, "failed to generate filename")
		return
	}
	filename := fmt.Sprintf("%d_%d_%s%s", time.Now().UnixMilli(), c.GetUint("user_id"), hex.EncodeToString(randomSuffix), ext)
	dst := filepath.Join(h.uploadDir, filename)

	if err := c.SaveUploadedFile(file, dst); err != nil {
		response.InternalError(c, "failed to save file")
		return
	}

	response.OK(c, gin.H{
		"url": "/avatars/" + filename,
	})
}

func validateImageHeader(r io.Reader) bool {
	header := make([]byte, 512)
	n, err := r.Read(header)
	if err != nil || n < 8 {
		return false
	}
	header = header[:n]
	switch {
	case len(header) >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47:
		return true
	case len(header) >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF:
		return true
	case len(header) >= 6 && header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x38:
		return true
	case len(header) >= 12 && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46 &&
		header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50:
		return true
	}
	return false
}

