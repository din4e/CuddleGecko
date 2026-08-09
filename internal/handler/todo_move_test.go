package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestTodoHandler_Move(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, WorkspaceID: 1}, nil)
	repo.On("Move", mock.Anything, uint(1), uint(1), mock.Anything, mock.Anything).Return(nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PATCH", "/api/todos/1/move", strings.NewReader(`{"parent_id":2}`))
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	repo.AssertExpectations(t)
}

func TestTodoHandler_Move_CycleReturns400(t *testing.T) {
	repo := new(mockTodoSvcRepo)
	eventRepo := new(mockTodoEventRepo)
	svc := service.NewTodoService(repo, eventRepo, repo)
	router := setupTodoRouter(svc)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Todo{ID: 1, WorkspaceID: 1}, nil)
	repo.On("Move", mock.Anything, uint(1), uint(1), mock.Anything, mock.Anything).Return(repository.ErrTodoCycle)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PATCH", "/api/todos/1/move", strings.NewReader(`{"parent_id":2}`))
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "cannot move")
}
