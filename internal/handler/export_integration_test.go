package handler

import (
	"encoding/json"
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

// setupExportTestRouter wires the export handlers to a real ExportService on an
// in-memory DB, with a fake auth middleware that sets workspace_id=1 (mirrors
// the workspace-scoped routes without the real JWT/WorkspaceAuth middleware).
func setupExportTestRouter(t *testing.T) *gin.Engine {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Contact{}, &model.Tag{}, &model.Interaction{}, &model.Reminder{},
		&model.ContactRelation{}, &model.Todo{}, &model.TodoItem{},
	))
	svc := service.NewExportService(
		repository.NewContactRepo(db), repository.NewTagRepo(db),
		repository.NewInteractionRepo(db), repository.NewReminderRepo(db),
		repository.NewRelationRepo(db), repository.NewTodoRepo(db), repository.NewTodoRepo(db),
	)
	h := NewExportHandler(svc)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", uint(1))
		c.Set("workspace_id", uint(1))
		c.Next()
	})
	r.POST("/export", h.Export)
	r.POST("/export/todos", h.ExportTodosCSV)
	r.POST("/import/todos", h.ImportTodosCSV)
	return r
}

// TestExportHTTP_FullJSON exercises the full-workspace JSON export through the
// HTTP handler → service → repo stack and checks the envelope + payload shape.
func TestExportHTTP_FullJSON(t *testing.T) {
	router := setupExportTestRouter(t)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("POST", "/export", nil))
	require.Equal(t, 200, w.Code)

	var env struct {
		Code int    `json:"code"`
		Data string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	var outer map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(env.Data), &outer))
	payload, ok := outer["data"].(map[string]interface{})
	require.True(t, ok, "payload has a data object")
	for _, k := range []string{"contacts", "tags", "todos", "interactions", "reminders", "relations"} {
		assert.Contains(t, payload, k, "JSON export includes %s", k)
	}
}

// TestExportHTTP_TodosCSV exercises the todos CSV export endpoint end to end.
func TestExportHTTP_TodosCSV(t *testing.T) {
	router := setupExportTestRouter(t)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("POST", "/export/todos", nil))
	require.Equal(t, 200, w.Code)

	var env struct {
		Code int    `json:"code"`
		Data string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	assert.Contains(t, env.Data, "title", "CSV has the header row")
}

// TestExportHTTP_ImportTodosCSV exercises the CSV import endpoint end to end and
// checks the {imported:N} envelope.
func TestExportHTTP_ImportTodosCSV(t *testing.T) {
	router := setupExportTestRouter(t)

	body := strings.NewReader(`{"data":"title,status\nHTTP import A,pending\nHTTP import B,done\n"}`)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("POST", "/import/todos", body))
	require.Equal(t, 200, w.Code)

	var env struct {
		Code int            `json:"code"`
		Data map[string]int `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	assert.Equal(t, 2, env.Data["imported"], "two rows imported over HTTP")
}
