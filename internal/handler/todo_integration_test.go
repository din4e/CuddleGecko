package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type todoEnvelope struct {
	Code    int             `json:"code"`
	Data    json.RawMessage `json:"data"`
	Message string          `json:"message"`
}

// setupTodoIntegrationRouter wires the real todo routes to a real service backed
// by an in-memory DB, so the full HTTP → handler → service → repo → DB stack is
// exercised (mockTodoEventRepo is never invoked because SyncToEvent isn't called).
func setupTodoIntegrationRouter(t *testing.T) *gin.Engine {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}))
	repo := repository.NewTodoRepo(db)
	svc := service.NewTodoService(repo, new(mockTodoEventRepo), repo)
	return setupTodoRouter(svc)
}

func doReq(t *testing.T, router *gin.Engine, method, path string, body interface{}) (*todoEnvelope, int) {
	t.Helper()
	buf := bytes.NewBuffer(nil)
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		buf = bytes.NewBuffer(b)
	}
	req, _ := http.NewRequest(method, path, buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var env todoEnvelope
	if w.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	}
	return &env, w.Code
}

func decodeTodo(t *testing.T, data json.RawMessage) model.Todo {
	t.Helper()
	var todo model.Todo
	require.NoError(t, json.Unmarshal(data, &todo))
	return todo
}

func TestTodoHTTP_CreateListToggle(t *testing.T) {
	router := setupTodoIntegrationRouter(t)

	// Create
	env, code := doReq(t, router, "POST", "/api/todos", map[string]interface{}{"title": "E2E task", "priority": "high"})
	require.Equal(t, http.StatusCreated, code)
	created := decodeTodo(t, env.Data)
	assert.Equal(t, "E2E task", created.Title)
	assert.Equal(t, "high", created.Priority)
	assert.NotZero(t, created.ID)

	// List (paginated) contains it
	env, code = doReq(t, router, "GET", "/api/todos", nil)
	require.Equal(t, http.StatusOK, code)
	var page struct {
		Items []model.Todo `json:"items"`
		Total int64        `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	require.Equal(t, int64(1), page.Total)
	assert.Equal(t, created.ID, page.Items[0].ID)

	// Toggle -> done
	env, code = doReq(t, router, "PATCH", fmt.Sprintf("/api/todos/%d/toggle", created.ID), nil)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "done", decodeTodo(t, env.Data).Status)
}

func TestTodoHTTP_Subitems(t *testing.T) {
	router := setupTodoIntegrationRouter(t)
	env, _ := doReq(t, router, "POST", "/api/todos", map[string]interface{}{"title": "parent"})
	parent := decodeTodo(t, env.Data)

	// Add a subtask
	env, code := doReq(t, router, "POST", fmt.Sprintf("/api/todos/%d/items", parent.ID), map[string]interface{}{"content": "step"})
	require.Equal(t, http.StatusCreated, code)
	var item model.TodoItem
	require.NoError(t, json.Unmarshal(env.Data, &item))
	assert.Equal(t, "step", item.Content)

	// List subtasks
	env, code = doReq(t, router, "GET", fmt.Sprintf("/api/todos/%d/items", parent.ID), nil)
	require.Equal(t, http.StatusOK, code)
	var items []model.TodoItem
	require.NoError(t, json.Unmarshal(env.Data, &items))
	require.Len(t, items, 1)

	// Parent counts reflect the subtask
	env, _ = doReq(t, router, "GET", "/api/todos", nil)
	var page struct {
		Items []model.Todo `json:"items"`
	}
	_ = json.Unmarshal(env.Data, &page)
	assert.Equal(t, 1, page.Items[0].ItemTotal)
}

func TestTodoHTTP_PinAndDuplicate(t *testing.T) {
	router := setupTodoIntegrationRouter(t)
	env, _ := doReq(t, router, "POST", "/api/todos", map[string]interface{}{"title": "original"})
	created := decodeTodo(t, env.Data)

	// Pin
	env, code := doReq(t, router, "PATCH", fmt.Sprintf("/api/todos/%d/pin", created.ID), nil)
	require.Equal(t, http.StatusOK, code)
	assert.True(t, decodeTodo(t, env.Data).Pinned)

	// Duplicate
	env, code = doReq(t, router, "POST", fmt.Sprintf("/api/todos/%d/duplicate", created.ID), nil)
	require.Equal(t, http.StatusCreated, code)
	clone := decodeTodo(t, env.Data)
	assert.Equal(t, "original", clone.Title)
	assert.Equal(t, "pending", clone.Status)
	assert.NotEqual(t, created.ID, clone.ID)
}

func TestTodoHTTP_TrashRestore(t *testing.T) {
	router := setupTodoIntegrationRouter(t)
	env, _ := doReq(t, router, "POST", "/api/todos", map[string]interface{}{"title": "doomed"})
	created := decodeTodo(t, env.Data)

	// Delete (soft)
	_, code := doReq(t, router, "DELETE", fmt.Sprintf("/api/todos/%d", created.ID), nil)
	require.Equal(t, http.StatusOK, code)

	// Trash lists it
	env, code = doReq(t, router, "GET", "/api/todos/trash", nil)
	require.Equal(t, http.StatusOK, code)
	var trash []model.Todo
	require.NoError(t, json.Unmarshal(env.Data, &trash))
	require.Len(t, trash, 1)
	assert.Equal(t, created.ID, trash[0].ID)

	// Restore
	_, code = doReq(t, router, "POST", fmt.Sprintf("/api/todos/%d/restore", created.ID), nil)
	require.Equal(t, http.StatusOK, code)

	// Back in the normal list
	env, _ = doReq(t, router, "GET", "/api/todos", nil)
	var page struct {
		Items []model.Todo `json:"items"`
		Total int64        `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	assert.Equal(t, int64(1), page.Total)
}

func TestTodoHTTP_BulkComplete_RecurringAdvances(t *testing.T) {
	router := setupTodoIntegrationRouter(t)
	orig := time.Date(2020, 1, 1, 9, 0, 0, 0, time.UTC)

	// A recurring daily task (past due) + a plain pending task.
	env, _ := doReq(t, router, "POST", "/api/todos", map[string]interface{}{
		"title": "standup", "repeat": "daily", "due_time": orig.Format(time.RFC3339),
	})
	rec := decodeTodo(t, env.Data)
	env, _ = doReq(t, router, "POST", "/api/todos", map[string]interface{}{"title": "one-off"})
	plain := decodeTodo(t, env.Data)

	// Bulk complete both over HTTP.
	env, code := doReq(t, router, "POST", "/api/todos/bulk",
		map[string]interface{}{"ids": []uint{rec.ID, plain.ID}, "action": "complete"})
	require.Equal(t, http.StatusOK, code)
	var res struct {
		Affected int64 `json:"affected"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &res))
	assert.Equal(t, int64(2), res.Affected)

	// Recurring advanced (pending, due moved forward); plain marked done.
	env, _ = doReq(t, router, "GET", "/api/todos", nil)
	var page struct {
		Items []model.Todo `json:"items"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	byID := map[uint]model.Todo{}
	for _, it := range page.Items {
		byID[it.ID] = it
	}
	assert.Equal(t, "pending", byID[rec.ID].Status, "recurring stays pending after bulk complete")
	assert.True(t, byID[rec.ID].DueTime.After(orig), "recurring due advanced")
	assert.Equal(t, "done", byID[plain.ID].Status, "plain task completed")
}

func TestTodoHTTP_RecurringToggleAdvances(t *testing.T) {
	router := setupTodoIntegrationRouter(t)
	past := time.Date(2020, 1, 1, 9, 0, 0, 0, time.UTC).Format(time.RFC3339)
	env, _ := doReq(t, router, "POST", "/api/todos", map[string]interface{}{
		"title":    "standup",
		"repeat":   "daily",
		"due_time": past,
	})
	created := decodeTodo(t, env.Data)

	env, code := doReq(t, router, "PATCH", fmt.Sprintf("/api/todos/%d/toggle", created.ID), nil)
	require.Equal(t, http.StatusOK, code)
	result := decodeTodo(t, env.Data)
	assert.Equal(t, "pending", result.Status, "recurring task stays pending over HTTP")
	assert.NotNil(t, result.DueTime)
	assert.True(t, result.DueTime.After(time.Date(2020, 1, 1, 9, 0, 0, 0, time.UTC)), "due advanced past the original date")
}
