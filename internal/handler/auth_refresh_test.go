package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// End-to-end session tests over a real in-memory DB: login → refresh with the
// HttpOnly cookie → rotated cookie keeps the session sliding. The rotation bug
// these guard against: /auth/refresh used to return the new refresh token only
// in the JSON body, so a browser (cookie-based) session presented the dead
// cookie on its NEXT refresh and was logged out ~2 access TTLs after login.

func setupAuthRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.RefreshToken{}))

	hashed, err := service.HashPassword("password123")
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.User{Username: "alice", Email: "alice@example.com", PasswordHash: hashed}).Error)

	jwtCfg := &config.JWTConfig{
		Secret:     "test-secret-that-is-long-enough-32ch",
		AccessTTL:  15 * time.Minute,
		RefreshTTL: 30 * 24 * time.Hour,
	}
	authSvc := service.NewAuthService(repository.NewUserRepo(db), jwtCfg, nil)
	h := NewAuthHandler(authSvc, service.NewCaptchaService(config.CaptchaConfig{Enabled: false}, nil))

	r := gin.New()
	r.POST("/api/auth/login", h.Login)
	r.POST("/api/auth/refresh", h.Refresh)
	return r, db
}

func loginForCookie(t *testing.T, r *gin.Engine) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(`{"username":"alice","password":"password123"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	cookie := refreshCookieValue(t, w)
	require.NotEmpty(t, cookie, "login must set the refresh cookie")
	return cookie
}

func refreshWithCookie(t *testing.T, r *gin.Engine, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	if cookie != "" {
		req.Header.Set("Cookie", refreshCookieName+"="+cookie)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func refreshCookieValue(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	for _, c := range w.Header().Values("Set-Cookie") {
		if !strings.HasPrefix(c, refreshCookieName+"=") {
			continue
		}
		value := strings.TrimPrefix(c, refreshCookieName+"=")
		return strings.SplitN(value, ";", 2)[0]
	}
	return ""
}

// The rotated refresh token must come back as a fresh cookie — otherwise the
// browser's next refresh presents the dead cookie and the session dies.
func TestAuthRefresh_RotatesCookie_SessionSlides(t *testing.T) {
	r, _ := setupAuthRouter(t)

	first := loginForCookie(t, r)

	w := refreshWithCookie(t, r, first)
	require.Equal(t, http.StatusOK, w.Code)
	second := refreshCookieValue(t, w)
	require.NotEmpty(t, second, "refresh must re-set the HttpOnly cookie")
	assert.NotEqual(t, first, second, "refresh token must rotate")

	// Sliding session: the rotated cookie keeps working across refreshes.
	w = refreshWithCookie(t, r, second)
	require.Equal(t, http.StatusOK, w.Code)
	third := refreshCookieValue(t, w)
	require.NotEmpty(t, third)
	assert.NotEqual(t, second, third)

	// Cookie attributes: HttpOnly, scoped to /api/auth, outlives the access token.
	setCookie := ""
	for _, c := range w.Header().Values("Set-Cookie") {
		if strings.HasPrefix(c, refreshCookieName+"=") {
			setCookie = c
		}
	}
	assert.Contains(t, setCookie, "HttpOnly")
	assert.Contains(t, setCookie, "Path=/api/auth")
	assert.Contains(t, setCookie, "Max-Age=2592000") // 30 days
}

// Replaying the just-consumed cookie is the benign multi-tab race: it 401s but
// must NOT kill the family — the winner's cookie keeps the session alive.
func TestAuthRefresh_ReplayWithinGrace_KeepsFamily(t *testing.T) {
	r, _ := setupAuthRouter(t)

	first := loginForCookie(t, r)
	w := refreshWithCookie(t, r, first)
	require.Equal(t, http.StatusOK, w.Code)
	second := refreshCookieValue(t, w)
	require.NotEmpty(t, second)

	// Stale tab replays the already-rotated cookie within the grace window.
	w = refreshWithCookie(t, r, first)
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// The rotation winner's session is unaffected.
	w = refreshWithCookie(t, r, second)
	assert.Equal(t, http.StatusOK, w.Code)
}

// A revoked token resurfacing long after rotation is the theft signal: the
// whole family dies and even fresh cookies stop working.
func TestAuthRefresh_LateReplay_KillsFamily(t *testing.T) {
	r, db := setupAuthRouter(t)

	first := loginForCookie(t, r)
	w := refreshWithCookie(t, r, first)
	require.Equal(t, http.StatusOK, w.Code)
	second := refreshCookieValue(t, w)
	require.NotEmpty(t, second)

	// Push the first token's revocation past the replay grace window.
	past := time.Now().Add(-time.Minute)
	require.NoError(t, db.Model(&model.RefreshToken{}).
		Where("token = ?", service.HashRefreshToken(first)).
		Update("revoked_at", past).Error)

	w = refreshWithCookie(t, r, first)
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// Family-wide revocation: the still-fresh successor is dead too.
	w = refreshWithCookie(t, r, second)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuthRefresh_MissingToken(t *testing.T) {
	r, _ := setupAuthRouter(t)

	w := refreshWithCookie(t, r, "")
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
