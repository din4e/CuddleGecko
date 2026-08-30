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

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type mockTodoSvcRepo struct {
	mock.Mock
}

func (m *mockTodoSvcRepo) Create(ctx context.Context, todo *model.Todo) error {
	return m.Called(ctx, todo).Error(0)
}

func (m *mockTodoSvcRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Todo, error) {
	args := m.Called(ctx, workspaceID, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Todo), args.Error(1)
}

func (m *mockTodoSvcRepo) List(ctx context.Context, workspaceID uint, q model.TodoListQuery) ([]model.Todo, int64, error) {
	args := m.Called(ctx, workspaceID, q)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]model.Todo), args.Get(1).(int64), args.Error(2)
}

func (m *mockTodoSvcRepo) Update(ctx context.Context, todo *model.Todo) error {
	return m.Called(ctx, todo).Error(0)
}

func (m *mockTodoSvcRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	return m.Called(ctx, workspaceID, id).Error(0)
}

func (m *mockTodoSvcRepo) ListItems(ctx context.Context, todoID uint) ([]model.TodoItem, error) {
	args := m.Called(ctx, todoID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.TodoItem), args.Error(1)
}

func (m *mockTodoSvcRepo) ListItemsByTodoIDs(ctx context.Context, todoIDs []uint) ([]model.TodoItem, error) {
	args := m.Called(ctx, todoIDs)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.TodoItem), args.Error(1)
}

func (m *mockTodoSvcRepo) GetItem(ctx context.Context, todoID, itemID uint) (*model.TodoItem, error) {
	args := m.Called(ctx, todoID, itemID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.TodoItem), args.Error(1)
}

func (m *mockTodoSvcRepo) CreateItem(ctx context.Context, item *model.TodoItem) error {
	return m.Called(ctx, item).Error(0)
}

func (m *mockTodoSvcRepo) UpdateItem(ctx context.Context, todoID uint, item *model.TodoItem) error {
	return m.Called(ctx, todoID, item).Error(0)
}

func (m *mockTodoSvcRepo) SetItemDone(ctx context.Context, todoID, itemID uint, done bool) error {
	return m.Called(ctx, todoID, itemID, done).Error(0)
}

func (m *mockTodoSvcRepo) DeleteItem(ctx context.Context, todoID, itemID uint) error {
	return m.Called(ctx, todoID, itemID).Error(0)
}

func (m *mockTodoSvcRepo) ReorderItem(ctx context.Context, todoID, itemID uint, afterItemID *uint) error {
	return m.Called(ctx, todoID, itemID, afterItemID).Error(0)
}

func (m *mockTodoSvcRepo) PromoteItem(ctx context.Context, userID, workspaceID, todoID, itemID uint) (*model.Todo, error) {
	args := m.Called(ctx, userID, workspaceID, todoID, itemID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Todo), args.Error(1)
}

func (m *mockTodoSvcRepo) Duplicate(ctx context.Context, userID, workspaceID, id uint) (*model.Todo, error) {
	args := m.Called(ctx, userID, workspaceID, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Todo), args.Error(1)
}

func (m *mockTodoSvcRepo) BulkAction(ctx context.Context, workspaceID uint, ids []uint, action string) (int64, error) {
	args := m.Called(ctx, workspaceID, ids, action)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockTodoSvcRepo) SetPinned(ctx context.Context, workspaceID, id uint, pinned bool) error {
	return m.Called(ctx, workspaceID, id, pinned).Error(0)
}

func (m *mockTodoSvcRepo) IncrementPomodoro(ctx context.Context, workspaceID, id uint) error {
	return m.Called(ctx, workspaceID, id).Error(0)
}

func (m *mockTodoSvcRepo) SetParent(ctx context.Context, workspaceID, id uint, parentID *uint) error {
	return m.Called(ctx, workspaceID, id, parentID).Error(0)
}

func (m *mockTodoSvcRepo) UpdateCreatedAt(ctx context.Context, id uint, at time.Time) error {
	return m.Called(ctx, id, at).Error(0)
}

func (m *mockTodoSvcRepo) ListTrash(ctx context.Context, workspaceID uint) ([]model.Todo, error) {
	args := m.Called(ctx, workspaceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Todo), args.Error(1)
}

func (m *mockTodoSvcRepo) Restore(ctx context.Context, workspaceID, id uint) error {
	return m.Called(ctx, workspaceID, id).Error(0)
}

func (m *mockTodoSvcRepo) ReplaceTags(ctx context.Context, todoID uint, tags []model.Tag) error {
	return m.Called(ctx, todoID, tags).Error(0)
}

func (m *mockTodoSvcRepo) GetTags(ctx context.Context, todoID uint) ([]model.Tag, error) {
	args := m.Called(ctx, todoID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Tag), args.Error(1)
}

func (m *mockTodoSvcRepo) Stats(ctx context.Context, workspaceID uint) (model.TodoStats, error) {
	args := m.Called(ctx, workspaceID)
	return args.Get(0).(model.TodoStats), args.Error(1)
}

func (m *mockTodoSvcRepo) Reorder(ctx context.Context, workspaceID, id uint, afterID *uint) error {
	return m.Called(ctx, workspaceID, id, afterID).Error(0)
}

func (m *mockTodoSvcRepo) Move(ctx context.Context, workspaceID, id uint, parentID, afterID *uint, position string) error {
	return m.Called(ctx, workspaceID, id, parentID, afterID, position).Error(0)
}

type mockTodoEventRepo struct {
	mock.Mock
}

func (m *mockTodoEventRepo) Create(ctx context.Context, event *model.Event) error {
	return m.Called(ctx, event).Error(0)
}

func setupTodoRouter(todoSvc *service.TodoService) *gin.Engine {
	r := gin.New()
	h := NewTodoHandler(todoSvc)

	api := r.Group("/api")
	api.Use(func(c *gin.Context) {
		c.Set("user_id", uint(1))
		c.Set("workspace_id", uint(1))
		c.Next()
	})
	{
		api.GET("/todos", h.List)
		api.GET("/todos/stats", h.Stats)
		api.GET("/todos/trash", h.ListTrash)
		api.POST("/todos", h.Create)
		api.POST("/todos/bulk", h.BulkAction)
		api.PUT("/todos/:id", h.Update)
		api.PATCH("/todos/:id/toggle", h.ToggleStatus)
		api.PATCH("/todos/:id/status", h.SetStatus)
		api.PATCH("/todos/:id/pin", h.TogglePin)
		api.PATCH("/todos/:id/reorder", h.Reorder)
		api.PATCH("/todos/:id/move", h.Move)
		api.POST("/todos/:id/sync-event", h.SyncToEvent)
		api.POST("/todos/:id/duplicate", h.Duplicate)
		api.POST("/todos/:id/pomodoro", h.IncrementPomodoro)
		api.POST("/todos/:id/restore", h.Restore)
		api.DELETE("/todos/:id", h.Delete)
		api.GET("/todos/:id/items", h.ListItems)
		api.POST("/todos/:id/items", h.CreateItem)
		api.PUT("/todos/:id/items/:itemId", h.UpdateItem)
		api.PATCH("/todos/:id/items/:itemId/toggle", h.ToggleItem)
		api.PATCH("/todos/:id/items/:itemId/reorder", h.ReorderItem)
		api.POST("/todos/:id/items/:itemId/promote", h.PromoteItem)
		api.DELETE("/todos/:id/items/:itemId", h.DeleteItem)
		api.GET("/todos/:id/tags", h.GetTags)
		api.PUT("/todos/:id/tags", h.ReplaceTags)
	}
	return r
}

func TestTodoHandler_List(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("List", mock.Anything, uint(1), mock.MatchedBy(func(q model.TodoListQuery) bool {
		return q.Page == 1 && q.PageSize == 50 && q.Sort == model.TodoSortDueDate && q.Order == "asc" && q.Status == ""
	})).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_List_WithStatusFilter(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("List", mock.Anything, uint(1), mock.MatchedBy(func(q model.TodoListQuery) bool {
		return q.Status == "pending" && q.Sort == model.TodoSortDueDate
	})).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos?status=pending", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_List_WithSortAndSearch(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("List", mock.Anything, uint(1), mock.MatchedBy(func(q model.TodoListQuery) bool {
		return q.Sort == model.TodoSortPriority && q.Order == "desc" && q.Search == "milk" && q.Overdue
	})).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos?sort=priority&order=desc&q=milk&overdue=1", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_List_InvalidDueBefore(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos?due_before=not-a-date", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTodoHandler_List_ParentFilterAndRootsOnly(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	parentID := uint(7)
	repo.On("List", mock.Anything, uint(1), mock.MatchedBy(func(q model.TodoListQuery) bool {
		return q.ParentID != nil && *q.ParentID == parentID && !q.RootsOnly
	})).Return([]model.Todo{}, int64(0), nil)
	repo.On("List", mock.Anything, uint(1), mock.MatchedBy(func(q model.TodoListQuery) bool {
		return q.RootsOnly && q.ParentID == nil
	})).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos?parent_id=7", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/todos?roots_only=true", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_BulkAction(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("BulkAction", mock.Anything, uint(1), []uint{1, 2, 3}, "complete").Return(int64(2), nil)

	body, _ := json.Marshal(map[string]interface{}{"ids": []int{1, 2, 3}, "action": "complete"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/bulk", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_TogglePin(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, Pinned: false}, nil)
	repo.On("SetPinned", mock.Anything, uint(1), uint(1), true).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/pin", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_BulkAction_InvalidAction(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{"ids": []int{1}, "action": "bogus"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/bulk", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTodoHandler_Stats(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("Stats", mock.Anything, uint(1)).Return(model.TodoStats{Total: 5, Pending: 3, Overdue: 1, DoneToday: 2, DoneThisWeek: 4}, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos/stats", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_ListTrash(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("ListTrash", mock.Anything, uint(1)).Return([]model.Todo{{ID: 7, Title: "deleted"}}, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos/trash", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_Restore(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("Restore", mock.Anything, uint(1), uint(7)).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/7/restore", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_Reorder(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	after := uint(2)
	repo.On("GetByID", mock.Anything, uint(1), uint(3)).Return(&model.Todo{ID: 3}, nil)
	repo.On("Reorder", mock.Anything, uint(1), uint(3), &after).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{"after_id": 2})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/3/reorder", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_Create(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("Create", mock.Anything, mock.MatchedBy(func(t *model.Todo) bool {
		return t.Title == "test todo" && t.Priority == "high" && t.Description == "with details" && t.DueTime != nil
	})).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{
		"title":       "test todo",
		"description": "with details",
		"priority":    "high",
		"due_time":    "2026-05-25T10:00:00Z",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_Create_MissingTitle(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTodoHandler_Create_InvalidDueTime(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{
		"title":     "test",
		"due_time":  "not-a-date",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTodoHandler_Update(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	existing := &model.Todo{ID: 1, Title: "old", Priority: "normal"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{
		"title":    "updated",
		"priority": "high",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/todos/1", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Update_NotFound(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(99)).Return(nil, service.ErrTodoNotFound)

	body, _ := json.Marshal(map[string]interface{}{"title": "x"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/todos/99", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestTodoHandler_ToggleStatus(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	existing := &model.Todo{ID: 1, Status: "pending"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/toggle", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_SetStatus(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	existing := &model.Todo{ID: 1, Status: "pending"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/status", strings.NewReader(`{"status":"abandoned"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_SetStatus_Invalid(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/status", strings.NewReader(`{"status":"bogus"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	repo.AssertNotCalled(t, "GetByID", mock.Anything, mock.Anything, mock.Anything)
}

func TestTodoHandler_SetStatus_MissingStatus(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/status", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code, "binding requires status")
}

func TestTodoHandler_SyncToEvent(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	existing := &model.Todo{ID: 1, Title: "meeting"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	eventRepo.On("Create", mock.Anything, mock.AnythingOfType("*model.Event")).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/1/sync-event", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
}

func TestTodoHandler_Delete(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("Delete", mock.Anything, uint(1), uint(1)).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/todos/1", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Duplicate(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, Title: "original"}, nil)
	repo.On("Duplicate", mock.Anything, uint(1), uint(1), uint(1)).Return(&model.Todo{ID: 9, Title: "original", Status: "pending"}, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/1/duplicate", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_Delete_NotFound(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("Delete", mock.Anything, uint(1), uint(99)).Return(service.ErrTodoNotFound)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/todos/99", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestTodoHandler_ListItems(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("ListItems", mock.Anything, uint(1)).Return([]model.TodoItem{{ID: 5, Content: "a"}}, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos/1/items", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_CreateItem(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("CreateItem", mock.Anything, mock.MatchedBy(func(i *model.TodoItem) bool {
		return i.Content == "step" && i.TodoID == 1
	})).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{"content": "step"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/1/items", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_CreateItem_MissingContent(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/1/items", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTodoHandler_ToggleItem(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(3)).Return(&model.TodoItem{ID: 3, Done: false}, nil)
	repo.On("SetItemDone", mock.Anything, uint(1), uint(3), true).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/items/3/toggle", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_DeleteItem(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(3)).Return(&model.TodoItem{ID: 3, Done: true}, nil)
	repo.On("DeleteItem", mock.Anything, uint(1), uint(3)).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/todos/1/items/3", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_ReorderItem(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	after := uint(2)
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(3)).Return(&model.TodoItem{ID: 3}, nil)
	repo.On("ReorderItem", mock.Anything, uint(1), uint(3), &after).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{"after_id": 2})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/items/3/reorder", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_PromoteItem(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetItem", mock.Anything, uint(1), uint(3)).Return(&model.TodoItem{ID: 3, Content: "step"}, nil)
	repo.On("PromoteItem", mock.Anything, uint(1), uint(1), uint(1), uint(3)).Return(&model.Todo{ID: 9, Title: "step"}, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos/1/items/3/promote", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_GetTags(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("GetTags", mock.Anything, uint(1)).Return([]model.Tag{{ID: 7, Name: "work"}}, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos/1/tags", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_ReplaceTags(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1}, nil)
	repo.On("ReplaceTags", mock.Anything, uint(1), mock.MatchedBy(func(tags []model.Tag) bool {
		return len(tags) == 2 && tags[0].ID == 7 && tags[1].ID == 8
	})).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{"tag_ids": []int{7, 8}})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/todos/1/tags", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_List_WithTagFilter(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("List", mock.Anything, uint(1), mock.MatchedBy(func(q model.TodoListQuery) bool {
		return len(q.TagIDs) == 1 && q.TagIDs[0] == 5
	})).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos?tag_id=5", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}
