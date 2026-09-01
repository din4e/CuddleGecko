package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/din4e/cuddlegecko/internal/handler"
	"github.com/din4e/cuddlegecko/internal/mcp"
	"github.com/din4e/cuddlegecko/internal/realtime"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if len(cfg.JWT.Secret) < 32 {
		log.Fatal("JWT secret must be at least 32 characters. Set jwt.secret in config.yaml or CG_JWT_SECRET env var.")
	}
	// The committed sample secret passes the length check but is public
	// knowledge — anyone could mint tokens for any user. Refuse to boot on it
	// in release mode (debug/dev keeps working via config.yaml).
	if cfg.JWT.Secret == "change-me-in-production-please-use-at-least-32-chars" {
		if cfg.Server.Mode == gin.ReleaseMode {
			log.Fatal("JWT secret is still the committed default — set a unique secret (CG_JWT_SECRET) before deploying.")
		}
		log.Println("WARNING: using the committed default JWT secret (dev only); set CG_JWT_SECRET for any real deployment.")
	}

	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	// Repositories
	userRepo := repository.NewUserRepo(db)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	taggingRepo := repository.NewTaggingRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	eventRepo := repository.NewEventRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	workoutRepo := repository.NewWorkoutRepo(db)
	workoutExerciseRepo := repository.NewWorkoutExerciseRepo(db)
	bodyMetricRepo := repository.NewBodyMetricRepo(db)
	habitRepo := repository.NewHabitRepo(db)
	habitLogRepo := repository.NewHabitLogRepo(db)
	pomodoroRepo := repository.NewPomodoroRepo(db)
	transactionRepo := repository.NewTransactionRepo(db)
	aiRepo := repository.NewAIRepo(db)
	workspaceRepo := repository.NewWorkspaceRepo(db)
	settingRepo := repository.NewSettingRepo(db)
	userSettingRepo := repository.NewUserSettingRepo(db)

	// Services
	workspaceSvc := service.NewWorkspaceService(workspaceRepo)
	authSvc := service.NewAuthService(userRepo, &cfg.JWT, workspaceSvc)
	captchaSvc := service.NewCaptchaService(cfg.Captcha, settingRepo)
	// The realtime hub fans entity mutations out to connected WS clients.
	// Built before the domain services so it can be wired in as their shared
	// change notifier.
	hub := realtime.NewHub()
	contactSvc := service.NewContactService(contactRepo, taggingRepo, reminderRepo, hub)
	tagSvc := service.NewTagService(tagRepo, hub)
	interactionSvc := service.NewInteractionService(interactionRepo, hub)
	reminderSvc := service.NewReminderService(reminderRepo, hub)
	relationSvc := service.NewRelationService(relationRepo, contactRepo, interactionRepo, hub)
	eventSvc := service.NewEventService(eventRepo, hub)
	todoActivityRepo := repository.NewTodoActivityRepo(db)
	todoSvc := service.NewTodoService(todoRepo, eventRepo, todoRepo, service.WithTodoNotifier(hub), service.WithTodoHistory(todoActivityRepo, userRepo))
	workoutSvc := service.NewWorkoutService(workoutRepo, workoutExerciseRepo, bodyMetricRepo, hub)
	exerciseLibraryRepo := repository.NewExerciseLibraryRepo(db)
	workoutTemplateRepo := repository.NewWorkoutTemplateRepo(db)
	workoutSetLogRepo := repository.NewWorkoutSetLogRepo(db)
	fitnessGoalRepo := repository.NewFitnessGoalRepo(db)
	fitnessSvc := service.NewFitnessService(exerciseLibraryRepo, workoutTemplateRepo, workoutSetLogRepo, fitnessGoalRepo, workoutSvc, hub)
	habitSvc := service.NewHabitService(habitRepo, habitLogRepo, hub)
	pomodoroSvc := service.NewPomodoroService(pomodoroRepo, hub)
	transactionSvc := service.NewTransactionService(transactionRepo, hub)
	aiSvc := service.NewAIService(aiRepo, contactRepo, eventRepo, interactionRepo, transactionRepo, relationRepo, cfg.AI)
	exportSvc := service.NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo,
		service.WithExportNotifier(hub),
		service.WithTransactionRepo(transactionRepo),
		service.WithEventRepo(eventRepo),
		service.WithWorkoutRepos(workoutRepo, workoutExerciseRepo, bodyMetricRepo),
		service.WithHabitRepos(habitRepo, habitLogRepo),
		service.WithPomodoroRepo(pomodoroRepo),
		service.WithFitnessRepos(exerciseLibraryRepo, workoutTemplateRepo, workoutSetLogRepo, fitnessGoalRepo),
		service.WithAIRepo(aiRepo))
	userSettingSvc := service.NewUserSettingService(userSettingRepo)

	// MCP Server
	mcpServer := mcp.NewServer(contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, todoSvc, workoutSvc, fitnessSvc, transactionSvc, aiSvc, workspaceSvc, habitSvc, pomodoroSvc)

	// Ensure avatar directory exists
	avatarDir := cfg.Server.AvatarDir
	if err := os.MkdirAll(avatarDir, 0o755); err != nil {
		log.Fatalf("Failed to create avatar dir %s: %v", avatarDir, err)
	}
	avatarAbs, err := filepath.Abs(avatarDir)
	if err != nil {
		log.Fatalf("Failed to resolve avatar dir: %v", err)
	}

	// Handlers
	handlers := handler.NewHandlers(authSvc, captchaSvc, contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, todoSvc, workoutSvc, fitnessSvc, transactionSvc, aiSvc, workspaceSvc, exportSvc, avatarAbs, cfg.AI, userSettingSvc, habitSvc, pomodoroSvc)
	handlers.WS = handler.NewWSHandler(hub, &cfg.JWT, workspaceSvc, cfg.Server.Mode, cfg.CORS.AllowOrigins)

	// Router
	gin.SetMode(cfg.Server.Mode)
	// gin.Default() logs the full path WITH query string — /api/ws passes the
	// access token via ?token=..., which would leak valid 15-minute tokens
	// into stdout/logs. Skip logging that path.
	r := gin.New()
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/api/ws"},
	}), gin.Recovery())
	handler.RegisterRoutes(r, handlers, cfg, workspaceSvc, mcpServer)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	srv := &http.Server{Addr: addr, Handler: r}
	go func() {
		log.Printf("CuddleGecko server starting on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Graceful shutdown: drop WS clients, then drain in-flight HTTP.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	hub.Close()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}
	log.Println("Server stopped")
}
