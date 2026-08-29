package handler

import (
	"net/http"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	svc       *service.AuthService
	captcha   *service.CaptchaService
}

func NewAuthHandler(svc *service.AuthService, captcha *service.CaptchaService) *AuthHandler {
	return &AuthHandler{svc: svc, captcha: captcha}
}

type registerRequest struct {
	Username      string `json:"username" binding:"required,min=3,max=50"`
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=6,max=72"` // bcrypt rejects >72 bytes
	CaptchaID     string `json:"captcha_id"`
	CaptchaAnswer string `json:"captcha_answer"`
}

type loginRequest struct {
	Username      string `json:"username" binding:"required"`
	Password      string `json:"password" binding:"required"`
	CaptchaID     string `json:"captcha_id"`
	CaptchaAnswer string `json:"captcha_answer"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// refreshCookieName carries the refresh token as an HttpOnly cookie so XSS in
// the SPA cannot read it at rest (the JSON field stays for non-browser
// clients like the desktop app). Path-scoped to the auth endpoints.
const refreshCookieName = "cg_refresh"

type authResponse struct {
	User         interface{} `json:"user"`
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if h.captcha.Enabled() {
		if !h.captcha.Verify(req.CaptchaID, req.CaptchaAnswer) {
			response.BadRequest(c, "invalid or expired captcha")
			return
		}
	}

	result, err := h.svc.Register(c.Request.Context(), req.Username, req.Email, req.Password)
	if err != nil {
		switch err {
		case service.ErrUserExists:
			response.BadRequest(c, "username already exists")
		default:
			response.InternalError(c, "failed to register")
		}
		return
	}

	h.setRefreshCookie(c, result.RefreshToken)
	c.JSON(http.StatusCreated, response.Response{
		Code: 0,
		Data: authResponse{
			User:         result.User,
			AccessToken:  result.AccessToken,
			RefreshToken: result.RefreshToken,
		},
		Message: "created",
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if h.captcha.Enabled() {
		if !h.captcha.Verify(req.CaptchaID, req.CaptchaAnswer) {
			response.BadRequest(c, "invalid or expired captcha")
			return
		}
	}

	result, err := h.svc.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		if err == service.ErrInvalidCredentials {
			response.Unauthorized(c, "invalid username or password")
			return
		}
		response.InternalError(c, "login failed")
		return
	}

	h.setRefreshCookie(c, result.RefreshToken)
	response.OK(c, authResponse{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	// Body may be empty when the browser relies on the HttpOnly cookie.
	_ = c.ShouldBindJSON(&req)
	token := req.RefreshToken
	if token == "" {
		token, _ = c.Cookie(refreshCookieName)
	}
	if token == "" {
		response.BadRequest(c, "refresh_token is required")
		return
	}

	result, err := h.svc.Refresh(c.Request.Context(), token)
	if err != nil {
		// Drop the stale cookie along with rejecting the request.
		h.clearRefreshCookie(c)
		response.Unauthorized(c, "invalid or expired refresh token")
		return
	}

	// The old token was consumed (rotated) — the browser must receive the new
	// one, or its next refresh would present the dead cookie and log the user
	// out. Non-browser clients keep using the JSON field instead.
	h.setRefreshCookie(c, result.RefreshToken)
	response.OK(c, authResponse{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	})
}

func (h *AuthHandler) setRefreshCookie(c *gin.Context, token string) {
	maxAge := int(h.svc.RefreshTTL().Seconds())
	c.SetCookie(refreshCookieName, token, maxAge, "/api/auth", "", isHTTPS(c), true)
}

func (h *AuthHandler) clearRefreshCookie(c *gin.Context) {
	c.SetCookie(refreshCookieName, "", -1, "/api/auth", "", isHTTPS(c), true)
}

// isHTTPS marks the cookie Secure when the request arrived over TLS (directly
// or via the nginx reverse proxy's X-Forwarded-Proto).
func isHTTPS(c *gin.Context) bool {
	return c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshRequest
	_ = c.ShouldBindJSON(&req)
	token := req.RefreshToken
	if token == "" {
		token, _ = c.Cookie(refreshCookieName)
	}
	if token != "" {
		_ = h.svc.Logout(c.Request.Context(), token)
	}
	h.clearRefreshCookie(c)
	response.OK(c, nil)
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetCurrentUser(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}
	response.OK(c, user)
}
