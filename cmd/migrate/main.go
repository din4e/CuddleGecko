package main

import (
	"context"
	"fmt"
	"log"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
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

	ctx := context.Background()

	// 1. Find all users
	var users []model.User
	if err := db.Find(&users).Error; err != nil {
		log.Fatalf("Failed to list users: %v", err)
	}

	workspaceRepo := repository.NewWorkspaceRepo(db)
	workspaceSvc := service.NewWorkspaceService(workspaceRepo)

	for _, user := range users {
		fmt.Printf("Processing user %d (%s)...\n", user.ID, user.Username)

		// 2. Create default workspace if not exists
		ws, err := workspaceSvc.GetDefaultWorkspace(ctx, user.ID)
		if err != nil {
			// No default workspace yet — create one
			ws, err = workspaceSvc.CreateDefaultWorkspace(ctx, user.ID)
			if err != nil {
				log.Printf("  Failed to create default workspace for user %d: %v", user.ID, err)
				continue
			}
			fmt.Printf("  Created default workspace %d\n", ws.ID)
		} else {
			fmt.Printf("  Default workspace already exists: %d\n", ws.ID)
		}

		wsID := ws.ID

		// 3. Backfill workspace_id on all business data (only where NULL)
		tables := []struct {
			name  string
			model interface{}
		}{
			{"contacts", &model.Contact{}},
			{"tags", &model.Tag{}},
			{"interactions", &model.Interaction{}},
			{"reminders", &model.Reminder{}},
			{"events", &model.Event{}},
			{"transactions", &model.Transaction{}},
			{"contact_relations", &model.ContactRelation{}},
		}

		for _, t := range tables {
			result := db.Model(t.model).
				Where("user_id = ? AND workspace_id = 0", user.ID).
				Update("workspace_id", wsID)
			if result.Error != nil {
				log.Printf("  Failed to backfill %s for user %d: %v", t.name, user.ID, result.Error)
			} else if result.RowsAffected > 0 {
				fmt.Printf("  Backfilled %d rows in %s\n", result.RowsAffected, t.name)
			}
		}
	}

	fmt.Println("Migration complete.")
}
