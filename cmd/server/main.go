package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/din4e/cuddlegecko/internal/handler"
	"github.com/din4e/cuddlegecko/internal/mcp"
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
	todoListRepo := repository.NewTodoListRepo(db)
	todoItemRepo := repository.NewTodoItemRepo(db)
	habitRepo := repository.NewHabitRepo(db)
	habitLogRepo := repository.NewHabitLogRepo(db)
	transactionRepo := repository.NewTransactionRepo(db)
	aiRepo := repository.NewAIRepo(db)
	workspaceRepo := repository.NewWorkspaceRepo(db)
	settingRepo := repository.NewSettingRepo(db)
	userSettingRepo := repository.NewUserSettingRepo(db)

	// Services
	workspaceSvc := service.NewWorkspaceService(workspaceRepo)
	authSvc := service.NewAuthService(userRepo, &cfg.JWT, workspaceSvc)
	captchaSvc := service.NewCaptchaService(cfg.Captcha, settingRepo)
	contactSvc := service.NewContactService(contactRepo, taggingRepo)
	tagSvc := service.NewTagService(tagRepo)
	interactionSvc := service.NewInteractionService(interactionRepo)
	reminderSvc := service.NewReminderService(reminderRepo)
	relationSvc := service.NewRelationService(relationRepo, contactRepo, interactionRepo)
	eventSvc := service.NewEventService(eventRepo)
	todoSvc := service.NewTodoService(todoRepo, eventRepo, taggingRepo, todoItemRepo)
	todoListSvc := service.NewTodoListService(todoListRepo)
	todoItemSvc := service.NewTodoItemService(todoItemRepo, todoRepo)
	habitSvc := service.NewHabitService(habitRepo, habitLogRepo)
	transactionSvc := service.NewTransactionService(transactionRepo)
	aiSvc := service.NewAIService(aiRepo, contactRepo, eventRepo, interactionRepo, transactionRepo, relationRepo, cfg.AI)
	exportSvc := service.NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo)
	userSettingSvc := service.NewUserSettingService(userSettingRepo)

	// MCP Server
	mcpServer := mcp.NewServer(contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, todoSvc, todoListSvc, todoItemSvc, transactionSvc, aiSvc, workspaceSvc, habitSvc)

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
	handlers := handler.NewHandlers(authSvc, captchaSvc, contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, todoSvc, todoListSvc, todoItemSvc, transactionSvc, aiSvc, workspaceSvc, exportSvc, avatarAbs, cfg.AI, userSettingSvc, habitSvc)

	// Router
	gin.SetMode(cfg.Server.Mode)
	r := gin.Default()
	handler.RegisterRoutes(r, handlers, cfg, workspaceSvc, mcpServer)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("CuddleGecko server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
