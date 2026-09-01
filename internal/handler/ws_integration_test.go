package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/realtime"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
)

// TestTodoHTTP_Create_BroadcastsOverWS is the full-chain end-to-end guard:
// an HTTP todo mutation flows service -> notifier -> hub -> a real WebSocket
// client connected to the same workspace, which receives a data.changed frame.
func TestTodoHTTP_Create_BroadcastsOverWS(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}))

	repo := repository.NewTodoRepo(db)
	hub := realtime.NewHub()
	svc := service.NewTodoService(repo, new(mockTodoEventRepo), repo, service.WithTodoNotifier(hub))

	// Reuse the todo routes (fake user_id=1 / workspace_id=1) and bolt on /api/ws.
	r := setupTodoRouter(svc)
	checker := &fakeWSChecker{member: map[[2]uint]bool{{1, 1}: true}, def: 1}
	wsHandler := NewWSHandler(hub, &config.JWTConfig{Secret: wsTestSecret}, checker, gin.DebugMode, nil)
	r.GET("/api/ws", wsHandler.Connect)

	srv := httptest.NewServer(r)
	defer srv.Close()

	// 1. Open a WS connection as user 1 in workspace 1.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/ws?token=" + mintWSToken(t, 1) + "&workspace_id=1"
	dctx, dcancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer dcancel()
	conn, resp, err := websocket.Dial(dctx, wsURL, nil)
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	// Let ServeWS register the client with the hub before we mutate.
	time.Sleep(100 * time.Millisecond)

	// 2. Mutate via HTTP. The service emits a change; the hub fans it out.
	res, err := http.Post(srv.URL+"/api/todos", "application/json",
		bytes.NewBufferString(`{"title":"sync e2e","priority":"high"}`))
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, res.StatusCode)
	res.Body.Close()

	// 3. The WS client in workspace 1 receives the broadcast.
	rctx, rcancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer rcancel()
	_, data, err := conn.Read(rctx)
	require.NoError(t, err)
	var f realtime.Frame
	require.NoError(t, json.Unmarshal(data, &f))
	assert.Equal(t, realtime.FrameDataChanged, f.Type)
	assert.Equal(t, uint(1), f.WorkspaceID)
	assert.Equal(t, "created", f.Kind)
	assert.NotZero(t, f.ID, "created frame should carry the new todo id")
}

// TestTodoHTTP_Broadcast_WorkspaceIsolation confirms a client in workspace 2
// does NOT receive a mutation made in workspace 1.
func TestTodoHTTP_Broadcast_WorkspaceIsolation(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}))

	repo := repository.NewTodoRepo(db)
	hub := realtime.NewHub()
	svc := service.NewTodoService(repo, new(mockTodoEventRepo), repo, service.WithTodoNotifier(hub))

	// setupTodoRouter pins mutations to workspace 1; connect a client to workspace 2.
	r := setupTodoRouter(svc)
	checker := &fakeWSChecker{member: map[[2]uint]bool{{1, 1}: true, {2, 1}: true}, def: 1}
	wsHandler := NewWSHandler(hub, &config.JWTConfig{Secret: wsTestSecret}, checker, gin.DebugMode, nil)
	r.GET("/api/ws", wsHandler.Connect)

	srv := httptest.NewServer(r)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/ws?token=" + mintWSToken(t, 1) + "&workspace_id=2"
	dctx, dcancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer dcancel()
	conn, resp, err := websocket.Dial(dctx, wsURL, nil)
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")
	time.Sleep(100 * time.Millisecond)

	res, err := http.Post(srv.URL+"/api/todos", "application/json",
		bytes.NewBufferString(`{"title":"ws1 only"}`))
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, res.StatusCode)
	res.Body.Close()

	// A client in workspace 2 must not receive workspace 1's broadcast.
	rctx, rcancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer rcancel()
	_, _, err = conn.Read(rctx)
	assert.Error(t, err, "workspace-2 client should not receive a workspace-1 broadcast")
}
