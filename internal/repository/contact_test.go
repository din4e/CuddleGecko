package repository

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newContactTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Contact{}, &model.Tag{}, &model.Tagging{}))
	return db
}

// ListGraphContacts projects only the graph-relevant columns and skips the Tags
// Preload (which List runs as a second query and the graph then discards).
func TestContactRepo_ListGraphContacts(t *testing.T) {
	db := newContactTestDB(t)
	repo := NewContactRepo(db)
	ctx := context.Background()

	c := &model.Contact{UserID: 1, WorkspaceID: 1, Name: "Ada", AvatarEmoji: "🦎", RelationshipLabels: []string{"friend"}}
	require.NoError(t, repo.Create(ctx, c))

	// Attach a tag so we can prove the graph projection does NOT load it.
	require.NoError(t, repo.ReplaceTags(ctx, c.ID, []model.Tag{{WorkspaceID: 1, Name: "vip"}}))

	got, err := repo.ListGraphContacts(ctx, 1)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, c.ID, got[0].ID)
	assert.Equal(t, "Ada", got[0].Name)
	assert.Equal(t, "🦎", got[0].AvatarEmoji)
	assert.Equal(t, []string{"friend"}, got[0].RelationshipLabels)
	assert.Empty(t, got[0].Tags, "graph projection must not load Tags")
}
