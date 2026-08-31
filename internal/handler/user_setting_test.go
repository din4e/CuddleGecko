package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupGraphSettingsRouter serves GET/PUT /api/settings/graph over an
// in-memory DB. Requests act as *currentUser, swappable per test to verify
// per-user isolation.
func setupGraphSettingsRouter(t *testing.T) (*gin.Engine, *uint) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.UserSetting{}))

	svc := service.NewUserSettingService(repository.NewUserSettingRepo(db))
	h := NewUserSettingHandler(svc)

	userID := uint(1)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", userID) })
	r.GET("/api/settings/graph", h.GetGraph)
	r.PUT("/api/settings/graph", h.UpdateGraph)
	return r, &userID
}

func doGetGraph(t *testing.T, r *gin.Engine) graphConfig {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/settings/graph", nil))
	require.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Data graphConfig `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	return resp.Data
}

func doUpdateGraph(t *testing.T, r *gin.Engine, body string) (int, graphConfig) {
	t.Helper()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/settings/graph", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var resp struct {
		Data graphConfig `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return w.Code, resp.Data
}

func TestGetGraphDefaults(t *testing.T) {
	r, _ := setupGraphSettingsRouter(t)
	cfg := doGetGraph(t, r)
	assert.Equal(t, defaultGraphConfig(), cfg)
}

func TestUpdateGraphSavesAndReturns(t *testing.T) {
	r, _ := setupGraphSettingsRouter(t)
	code, out := doUpdateGraph(t, r, `{"nodeRadius":25,"emojiSize":36,"showLabels":false,"showSelf":false,"layoutMode":"cluster","linkDistance":80,"chargeStrength":60}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 25, out.NodeRadius)
	assert.Equal(t, 36, out.EmojiSize)
	assert.False(t, out.ShowLabels)
	assert.False(t, out.ShowSelf)
	assert.Equal(t, "cluster", out.LayoutMode)
	assert.Equal(t, 80, out.LinkDistance)
	assert.Equal(t, 60, out.ChargeStrength)
	assert.Equal(t, out, doGetGraph(t, r))
}

func TestUpdateGraphPartialMergesOverStored(t *testing.T) {
	r, _ := setupGraphSettingsRouter(t)
	_, _ = doUpdateGraph(t, r, `{"showLabels":false,"showSelf":false,"layoutMode":"random"}`)

	// A partial update must not reset fields it doesn't mention.
	code, out := doUpdateGraph(t, r, `{"nodeRadius":30}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 30, out.NodeRadius)
	assert.False(t, out.ShowLabels, "partial update must keep stored showLabels")
	assert.False(t, out.ShowSelf, "partial update must keep stored showSelf")
	assert.Equal(t, "random", out.LayoutMode, "partial update must keep stored layoutMode")
}

func TestUpdateGraphClampsOutOfRangeValues(t *testing.T) {
	r, _ := setupGraphSettingsRouter(t)
	code, out := doUpdateGraph(t, r, `{"nodeRadius":999,"emojiSize":0,"linkDistance":-5,"chargeStrength":100000,"layoutMode":"bogus"}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 40, out.NodeRadius)
	assert.Equal(t, 12, out.EmojiSize)
	assert.Equal(t, 10, out.LinkDistance)
	assert.Equal(t, 100, out.ChargeStrength)
	assert.Equal(t, "force", out.LayoutMode, "unknown layout falls back to force")

	// The clamped values are what gets persisted, not the raw request.
	assert.Equal(t, out, doGetGraph(t, r))
}

func TestGraphSettingsArePerUser(t *testing.T) {
	r, currentUser := setupGraphSettingsRouter(t)
	_, _ = doUpdateGraph(t, r, `{"nodeRadius":40}`)

	*currentUser = 2
	cfg := doGetGraph(t, r)
	assert.Equal(t, defaultGraphConfig(), cfg, "another user must not see user 1's config")
}

func TestUpdateGraphInvalidBody(t *testing.T) {
	r, _ := setupGraphSettingsRouter(t)
	code, _ := doUpdateGraph(t, r, `{"nodeRadius": "oops"}`)
	assert.Equal(t, http.StatusBadRequest, code)
}
