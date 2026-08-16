package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newAICacheTestService(t *testing.T) (*AIService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Contact{}, &model.Tag{}, &model.Event{}, &model.Transaction{}))
	svc := NewAIService(
		repository.NewAIRepo(db),
		repository.NewContactRepo(db),
		repository.NewEventRepo(db),
		repository.NewInteractionRepo(db),
		repository.NewTransactionRepo(db),
		repository.NewRelationRepo(db),
		config.AIConfig{},
	)
	return svc, db
}

// buildSystemPrompt caches per workspace for promptCacheTTL. Adding a contact
// between two calls within the TTL must NOT appear in the second prompt
// (stale-but-cached), proving the rebuild is skipped.
func TestAIService_SystemPromptCache(t *testing.T) {
	svc, db := newAICacheTestService(t)
	ctx := context.Background()

	require.NoError(t, db.Create(&model.Contact{UserID: 1, WorkspaceID: 1, Name: "Alice"}).Error)

	p1, err := svc.buildSystemPrompt(ctx, 1, 1)
	require.NoError(t, err)
	assert.Contains(t, p1, "Alice")

	// A newly added contact must not surface while the cache is fresh.
	require.NoError(t, db.Create(&model.Contact{UserID: 1, WorkspaceID: 1, Name: "Bobbian"}).Error)
	p2, err := svc.buildSystemPrompt(ctx, 1, 1)
	require.NoError(t, err)
	assert.Equal(t, p1, p2, "second call within TTL served from cache")
	assert.NotContains(t, p2, "Bobbian", "cached prompt must be stale within TTL")

	// A different workspace is cached independently and starts uncached.
	p3, err := svc.buildSystemPrompt(ctx, 1, 2)
	require.NoError(t, err)
	assert.NotEqual(t, p1, p3, "different workspace has its own (uncached) prompt")
}
