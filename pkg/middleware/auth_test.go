package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func makeToken(secret string, userID uint, ttl time.Duration) string {
	claims := jwt.MapClaims{"user_id": float64(userID), "exp": time.Now().Add(ttl).Unix()}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, _ := token.SignedString([]byte(secret))
	return s
}

func TestJWTAuth_ValidToken(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}
	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.JSON(200, gin.H{"user_id": GetUserID(c)}) })
	token := makeToken("test-secret", 42, 15*time.Minute)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestJWTAuth_MissingHeader(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}
	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.Status(200) })
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestJWTAuth_InvalidToken(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}
	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.Status(200) })
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}
	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.Status(200) })
	token := makeToken("test-secret", 42, -1*time.Hour)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
