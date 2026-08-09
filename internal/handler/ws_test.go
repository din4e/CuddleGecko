package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/din4e/cuddlegecko/internal/realtime"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
)

// fakeWSChecker implements middleware.WorkspaceMemberChecker for tests without
// needing a real workspace service/repo.
type fakeWSChecker struct {
	member  map[[2]uint]bool // (workspaceID, userID) -> member?
	def     uint
}

func (f *fakeWSChecker) IsMember(_ context.Context, workspaceID, userID uint) bool {
	return f.member[[2]uint{workspaceID, userID}]
}

func (f *fakeWSChecker) GetDefaultWorkspaceID(_ context.Context, _ uint) (uint, error) {
	return f.def, nil
}

const wsTestSecret = "test-secret-at-least-32-characters-long"

func newWSTestHandler(t *testing.T) (*realtime.Hub, *WSHandler) {
	t.Helper()
	hub := realtime.NewHub()
	checker := &fakeWSChecker{
		member: map[[2]uint]bool{{1, 7}: true},
		def:    1,
	}
	return hub, NewWSHandler(hub, &config.JWTConfig{Secret: wsTestSecret}, checker, gin.DebugMode, nil)
}

func mintWSToken(t *testing.T, userID uint) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"user_id": float64(userID)})
	s, err := tok.SignedString([]byte(wsTestSecret))
	require.NoError(t, err)
	return s
}

func TestWS_MissingToken_Returns401(t *testing.T) {
	_, h := newWSTestHandler(t)
	r := gin.New()
	r.GET("/api/ws", h.Connect)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/ws", nil))
	assert.Equal(t, 401, w.Code)
}

func TestWS_BadToken_Returns401(t *testing.T) {
	_, h := newWSTestHandler(t)
	r := gin.New()
	r.GET("/api/ws", h.Connect)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/ws?token=nope", nil))
	assert.Equal(t, 401, w.Code)
}

func TestWS_NonMember_Returns403(t *testing.T) {
	_, h := newWSTestHandler(t)
	r := gin.New()
	r.GET("/api/ws", h.Connect)

	// workspace 999 — user 7 is not a member.
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/ws?token="+mintWSToken(t, 7)+"&workspace_id=999", nil))
	assert.Equal(t, 403, w.Code)
}

func TestWS_ConnectReceivesBroadcast(t *testing.T) {
	hub, h := newWSTestHandler(t)
	r := gin.New()
	r.GET("/api/ws", h.Connect)
	srv := httptest.NewServer(r)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/ws?token=" + mintWSToken(t, 7) + "&workspace_id=1"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, resp, err := websocket.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	// Give ServeWS a moment to register the client with the hub after the upgrade.
	time.Sleep(100 * time.Millisecond)

	hub.NotifyTodoChange(ctx, 1, 42, service.TodoUpdated)

	rctx, cancel2 := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel2()
	_, data, err := conn.Read(rctx)
	require.NoError(t, err)

	var f realtime.Frame
	require.NoError(t, json.Unmarshal(data, &f))
	assert.Equal(t, realtime.FrameTodoChanged, f.Type)
	assert.Equal(t, uint(1), f.WorkspaceID)
	assert.Equal(t, uint(42), f.TodoID)
	assert.Equal(t, "updated", f.Kind)
}
