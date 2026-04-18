package main

import (
	"fmt"
	"log"

	"github.com/din4e/cuddlegecko/internal/handler"
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

	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	// Repositories
	userRepo := repository.NewUserRepo(db)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	eventRepo := repository.NewEventRepo(db)
	transactionRepo := repository.NewTransactionRepo(db)

	// Services
	authSvc := service.NewAuthService(userRepo, &cfg.JWT)
	captchaSvc := service.NewCaptchaService(cfg.Captcha)
	contactSvc := service.NewContactService(contactRepo)
	tagSvc := service.NewTagService(tagRepo)
	interactionSvc := service.NewInteractionService(interactionRepo)
	reminderSvc := service.NewReminderService(reminderRepo)
	relationSvc := service.NewRelationService(relationRepo, contactRepo)
	eventSvc := service.NewEventService(eventRepo)
	transactionSvc := service.NewTransactionService(transactionRepo)

	// Handlers
	handlers := handler.NewHandlers(authSvc, captchaSvc, contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc, eventSvc, transactionSvc, "./data/avatars")

	// Router
	gin.SetMode(cfg.Server.Mode)
	r := gin.Default()
	handler.RegisterRoutes(r, handlers, &cfg.JWT)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("CuddleGecko server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
