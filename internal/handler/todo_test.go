package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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

func (m *mockTodoSvcRepo) List(ctx context.Context, workspaceID uint, status *string, listID *uint, overdue bool, idFilter []uint, page, pageSize int) ([]model.Todo, int64, error) {
	args := m.Called(ctx, workspaceID, status, listID, overdue, idFilter, page, pageSize)
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

type mockTodoEventRepo struct {
	mock.Mock
}

func (m *mockTodoEventRepo) Create(ctx context.Context, event *model.Event) error {
	return m.Called(ctx, event).Error(0)
}

type hNoopTaggingRepo struct{}

func (hNoopTaggingRepo) SetTags(context.Context, uint, string, uint, []uint) error                        { return nil }
func (hNoopTaggingRepo) GetTags(context.Context, uint, string, uint) ([]model.Tag, error)                 { return nil, nil }
func (hNoopTaggingRepo) GetTagsByTargets(context.Context, uint, string, []uint) (map[uint][]model.Tag, error) { return nil, nil }
func (hNoopTaggingRepo) FilterTargetIDs(context.Context, uint, string, []uint) ([]uint, error)            { return nil, nil }
func (hNoopTaggingRepo) RemoveAll(context.Context, uint, string, uint) error                              { return nil }

type hNoopTodoItemRepo struct{}

func (hNoopTodoItemRepo) Create(context.Context, *model.TodoItem) error                                    { return nil }
func (hNoopTodoItemRepo) GetByID(context.Context, uint, uint) (*model.TodoItem, error)                     { return nil, nil }
func (hNoopTodoItemRepo) ListByTodo(context.Context, uint, uint) ([]model.TodoItem, error)                 { return nil, nil }
func (hNoopTodoItemRepo) ListByTodos(context.Context, uint, []uint) (map[uint][]model.TodoItem, error)     { return nil, nil }
func (hNoopTodoItemRepo) Update(context.Context, *model.TodoItem) error                                    { return nil }
func (hNoopTodoItemRepo) Delete(context.Context, uint, uint) error                                         { return nil }
func (hNoopTodoItemRepo) DeleteByTodo(context.Context, uint, uint) error                                   { return nil }

func newSvc(repo *mockTodoSvcRepo) *service.TodoService {
	return service.NewTodoService(repo, new(mockTodoEventRepo), hNoopTaggingRepo{}, hNoopTodoItemRepo{})
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
		api.POST("/todos", h.Create)
		api.PUT("/todos/:id", h.Update)
		api.PATCH("/todos/:id/toggle", h.ToggleStatus)
		api.POST("/todos/:id/sync-event", h.SyncToEvent)
		api.DELETE("/todos/:id", h.Delete)
	}
	return r
}

func TestTodoHandler_List(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	repo.On("List", mock.Anything, uint(1), (*string)(nil), (*uint)(nil), false, []uint(nil), 1, 50).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_List_WithStatusFilter(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	pending := "pending"
	repo.On("List", mock.Anything, uint(1), &pending, mock.Anything, mock.Anything, mock.Anything, 1, 50).Return([]model.Todo{}, int64(0), nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/todos?status=pending", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Create(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	repo.On("Create", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	body, _ := json.Marshal(map[string]interface{}{
		"title":     "test todo",
		"priority":  "high",
		"due_time":  "2026-05-25T10:00:00Z",
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
	svc := newSvc(repo)
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
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{
		"title":    "test",
		"due_time": "not-a-date",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/todos", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTodoHandler_Update(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	svc := newSvc(repo)
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
	svc := newSvc(repo)
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
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	existing := &model.Todo{ID: 1, Status: "pending"}
	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(existing, nil)
	repo.On("Update", mock.Anything, mock.AnythingOfType("*model.Todo")).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", "/api/todos/1/toggle", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_SyncToEvent(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, hNoopTaggingRepo{}, hNoopTodoItemRepo{})
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
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	repo.On("Delete", mock.Anything, uint(1), uint(1)).Return(nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/todos/1", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Delete_NotFound(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	svc := newSvc(repo)
	router := setupTodoRouter(svc)

	repo.On("Delete", mock.Anything, uint(1), uint(99)).Return(service.ErrTodoNotFound)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/todos/99", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}
