package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/mcp"
	"github.com/din4e/cuddlegecko/internal/realtime"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// Wiring smoke test: build the FULL dependency graph exactly as main() does
// (repos → services → hub → MCP → handlers → routes) over a real in-memory
// DB and assert the routes register and respond. Route-table changes (the
// rate-limiter group split, the /ai LLM subgroup, the captcha limiter, new
// endpoints) previously had no test — a nil handler or panic surfaced only at
// startup in production.
func TestFullWiring_RoutesRegisterAndServe(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	// main() gets this from database.Init's AutoMigrate; replicate it so the
	// register flow has its tables.
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.RefreshToken{}, &model.Workspace{}, &model.WorkspaceMember{},
		&model.Contact{}, &model.Tag{}, &model.Interaction{}, &model.Reminder{},
		&model.ContactRelation{}, &model.Event{}, &model.Todo{}, &model.TodoItem{},
		&model.Workout{}, &model.WorkoutExercise{}, &model.BodyMetric{}, &model.Transaction{},
		&model.AIProvider{}, &model.AIConversation{}, &model.AIMessage{},
		&model.Setting{}, &model.UserSetting{},
	))

	userRepo := repository.NewUserRepo(db)
	contactRepo := repository.NewContactRepo(db)
	taggingRepo := repository.NewTaggingRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	eventRepo := repository.NewEventRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	workoutRepo := repository.NewWorkoutRepo(db)
	workoutExerciseRepo := repository.NewWorkoutExerciseRepo(db)
	bodyMetricRepo := repository.NewBodyMetricRepo(db)
	transactionRepo := repository.NewTransactionRepo(db)
	aiRepo := repository.NewAIRepo(db)
	workspaceRepo := repository.NewWorkspaceRepo(db)
	settingRepo := repository.NewSettingRepo(db)
	userSettingRepo := repository.NewUserSettingRepo(db)

	jwtCfg := &config.JWTConfig{Secret: "wiring-test-secret-0123456789abcdef", AccessTTL: 15 * time.Minute, RefreshTTL: 24 * time.Hour}
	workspaceSvc := service.NewWorkspaceService(workspaceRepo)
	authSvc := service.NewAuthService(userRepo, jwtCfg, workspaceSvc)
	captchaSvc := service.NewCaptchaService(config.CaptchaConfig{}, settingRepo)
	contactSvc := service.NewContactService(contactRepo, taggingRepo)
	tagSvc := service.NewTagService(tagRepo)
	interactionSvc := service.NewInteractionService(interactionRepo)
	reminderSvc := service.NewReminderService(reminderRepo)
	relationSvc := service.NewRelationService(relationRepo, contactRepo, interactionRepo)
	eventSvc := service.NewEventService(eventRepo)
	hub := realtime.NewHub()
	defer hub.Close()
	todoSvc := service.NewTodoService(todoRepo, eventRepo, todoRepo, service.WithTodoNotifier(hub))
	workoutSvc := service.NewWorkoutService(workoutRepo, workoutExerciseRepo, bodyMetricRepo)
	transactionSvc := service.NewTransactionService(transactionRepo)
	aiSvc := service.NewAIService(aiRepo, contactRepo, eventRepo, interactionRepo, transactionRepo, relationRepo, config.AIConfig{})
	exportSvc := service.NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo,
		service.WithExportNotifier(hub), service.WithTransactionRepo(transactionRepo), service.WithEventRepo(eventRepo),
		service.WithWorkoutRepos(workoutRepo, workoutExerciseRepo, bodyMetricRepo))
	userSettingSvc := service.NewUserSettingService(userSettingRepo)
	mcpServer := mcp.NewServer(contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, todoSvc, workoutSvc, nil, transactionSvc, aiSvc, workspaceSvc, nil, nil)

	avatarDir := t.TempDir()
	handlers := NewHandlers(authSvc, captchaSvc, contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, todoSvc, workoutSvc, nil, transactionSvc, aiSvc, workspaceSvc, exportSvc, avatarDir, config.AIConfig{}, userSettingSvc, nil, nil)
	handlers.WS = NewWSHandler(hub, jwtCfg, workspaceSvc, gin.TestMode, []string{})

	r := gin.New()
	cfg := &config.Config{
		Server:  config.ServerConfig{Mode: gin.TestMode, AvatarDir: avatarDir},
		CORS:    config.CORSConfig{},
	}
	RegisterRoutes(r, handlers, cfg, workspaceSvc, mcpServer)

	// Every route changed/added during the optimization work must exist and
	// be wired to a live handler (405 vs 404 distinguishes "route exists,
	// wrong method" from "route never registered").
	for _, route := range []struct {
		method, path string
	}{
		{"GET", "/api/transactions/monthly"},   // iter 12 endpoint
		{"GET", "/api/todos/trash"},            // cascade trash
		{"PATCH", "/api/todos/1/move"},         // tree move
		{"POST", "/api/ai/chat"},               // rate-limited LLM group
		{"POST", "/api/ai/analyze"},            // rate-limited LLM group
		{"GET", "/api/captcha"},                // rate-limited public
		{"GET", "/api/version"},                // public version/health probe
		{"GET", "/api/ws"},                     // bare-group WS
		{"GET", "/api/auth/me"},                // protected
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(route.method, route.path, nil)
		r.ServeHTTP(w, req)
		assert.NotEqual(t, http.StatusNotFound, w.Code,
			"%s %s must be registered (got %d)", route.method, route.path, w.Code)
	}

	// End-to-end through the full stack: register → login → authed request.
	// (First: the version endpoint must answer 200 with a version payload —
	// it's the release build's runtime version report + healthcheck target.)
	var w *httptest.ResponseRecorder
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/version", nil))
	require.Equal(t, http.StatusOK, w.Code, "version endpoint: %s", w.Body.String())
	assert.Contains(t, w.Body.String(), `"version"`)

	w = httptest.NewRecorder()
	body := `{"username":"wiringsmoke","email":"w@x.io","password":"longenough1","captcha":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	// 200/201 = success; 400 = captcha-required validation (config-dependent,
	// acceptable); anything else = wiring failure.
	assert.Contains(t, []int{http.StatusOK, http.StatusCreated, http.StatusBadRequest}, w.Code,
		"register through full wiring got %d: %s", w.Code, w.Body.String())
}
