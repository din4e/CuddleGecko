package mcp

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// newTodoOnlyServer wires an MCPServer with only the todo service (every other
// service is nil — safe because tool handlers are only invoked when called, and
// we only call todo tools). Lets us test the MCP tool arg→service wiring without
// constructing the whole service graph.
func newTodoOnlyServer(t *testing.T) (*MCPServer, *repository.TodoRepo) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Todo{}, &model.TodoItem{}, &model.Tag{}))
	todoRepo := repository.NewTodoRepo(db)
	todoSvc := service.NewTodoService(todoRepo, nil, todoRepo)
	srv := NewServer(nil, nil, nil, nil, nil, nil, todoSvc, nil, nil, nil, nil)
	return srv, todoRepo
}

// TestMCP_CreateTodoTool drives the create_todo MCP tool end to end (args →
// service → repo) and checks the arg parsing (float64 JSON numbers, priority).
func TestMCP_CreateTodoTool(t *testing.T) {
	srv, repo := newTodoOnlyServer(t)
	ctx := context.Background()

	res, err := srv.tools["create_todo"].handler(ctx, 1, 1, map[string]interface{}{
		"title":    "mcp todo",
		"priority": "high",
	})
	require.NoError(t, err)
	todo, ok := res.(*model.Todo)
	require.True(t, ok, "create_todo returns *Todo")
	assert.Equal(t, "mcp todo", todo.Title)
	assert.Equal(t, "high", todo.Priority)
	assert.NotZero(t, todo.ID)

	// Persisted in the workspace.
	got, err := repo.GetByID(ctx, 1, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, "mcp todo", got.Title)
}

// TestMCP_MoveTodoTool drives the move_todo tool (nesting) end to end.
func TestMCP_MoveTodoTool(t *testing.T) {
	srv, repo := newTodoOnlyServer(t)
	ctx := context.Background()

	parent := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "parent"}
	require.NoError(t, repo.Create(ctx, parent))
	child := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "child"}
	require.NoError(t, repo.Create(ctx, child))

	// JSON numbers arrive as float64; the tool's toUint must coerce them.
	res, err := srv.tools["move_todo"].handler(ctx, 1, 1, map[string]interface{}{
		"id":        float64(child.ID),
		"parent_id": float64(parent.ID),
	})
	require.NoError(t, err)
	m, ok := res.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, true, m["success"])

	got, err := repo.GetByID(ctx, 1, child.ID)
	require.NoError(t, err)
	require.NotNil(t, got.ParentID, "child nested under parent via the tool")
	assert.Equal(t, parent.ID, *got.ParentID)
}
