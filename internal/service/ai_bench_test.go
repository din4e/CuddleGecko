package service

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
)

func openStressDB(b *testing.B) (*AIService, []uint, []uint) {
	b.Helper()
	if _, err := os.Stat("../../data/cuddlegecko.db"); err != nil {
		b.Skip("stress database not found")
	}
	cfg := &config.DatabaseConfig{
		Driver:     "sqlite",
		SQLitePath: "../../data/cuddlegecko.db",
	}
	db, err := database.Init(cfg)
	if err != nil {
		b.Fatalf("init db: %v", err)
	}

	var contactIDs []uint
	if err := db.Table("contacts").Where("workspace_id = 1").Order("id ASC").Limit(10).Pluck("id", &contactIDs).Error; err != nil {
		b.Fatalf("get contact ids: %v", err)
	}
	var eventIDs []uint
	if err := db.Table("events").Where("workspace_id = 1").Order("id ASC").Limit(10).Pluck("id", &eventIDs).Error; err != nil {
		b.Fatalf("get event ids: %v", err)
	}

	aiRepo := repository.NewAIRepo(db)
	contactRepo := repository.NewContactRepo(db)
	eventRepo := repository.NewEventRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	transactionRepo := repository.NewTransactionRepo(db)
	relationRepo := repository.NewRelationRepo(db)

	svc := NewAIService(aiRepo, contactRepo, eventRepo, interactionRepo, transactionRepo, relationRepo, config.AIConfig{})
	return svc, contactIDs, eventIDs
}

func BenchmarkBuildContactAnalysis(b *testing.B) {
	svc, contactIDs, _ := openStressDB(b)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var sb strings.Builder
		svc.buildContactAnalysis(ctx, 1, 1, contactIDs, &sb)
	}
}

func BenchmarkBuildEventAnalysis(b *testing.B) {
	svc, _, eventIDs := openStressDB(b)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var sb strings.Builder
		svc.buildEventAnalysis(ctx, 1, 1, eventIDs, &sb)
	}
}
