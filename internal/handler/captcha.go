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
