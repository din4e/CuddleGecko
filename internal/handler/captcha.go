package handler

import (
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type CaptchaHandler struct {
	svc *service.CaptchaService
}

func NewCaptchaHandler(svc *service.CaptchaService) *CaptchaHandler {
	return &CaptchaHandler{svc: svc}
}

type captchaResponse struct {
	Enabled bool   `json:"enabled"`
	ID      string `json:"captcha_id,omitempty"`
	Image   string `json:"captcha_image,omitempty"`
}

func (h *CaptchaHandler) Get(c *gin.Context) {
	if !h.svc.Enabled() {
		response.OK(c, captchaResponse{Enabled: false})
		return
	}

	id, img, err := h.svc.Generate()
	if err != nil {
		response.InternalError(c, "failed to generate captcha")
		return
	}

	response.OK(c, captchaResponse{
		Enabled: true,
		ID:      id,
		Image:   service.FormatCaptchaImage(img),
	})
}

type captchaConfigResponse struct {
	Enabled bool `json:"enabled"`
	Length  int  `json:"length"`
}

// GetConfig returns the live captcha configuration.
func (h *CaptchaHandler) GetConfig(c *gin.Context) {
	enabled, length := h.svc.GetConfig()
	response.OK(c, captchaConfigResponse{Enabled: enabled, Length: length})
}

type captchaConfigRequest struct {
	Enabled *bool `json:"enabled"`
	Length  *int  `json:"length"`
}

// UpdateConfig updates enabled and/or length (partial update), persists, returns sanitized result.
func (h *CaptchaHandler) UpdateConfig(c *gin.Context) {
	var req captchaConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	enabled, length := h.svc.GetConfig()
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if req.Length != nil {
		length = *req.Length
	}
	if err := h.svc.SetConfig(c.Request.Context(), enabled, length); err != nil {
		response.InternalError(c, "failed to save captcha config")
		return
	}
	enabled, length = h.svc.GetConfig()
	response.OK(c, captchaConfigResponse{Enabled: enabled, Length: length})
}
