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

func newAITestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.AIConversation{}, &model.AIMessage{}))
	return db
}

// Regression: StreamChat used to "title" a new conversation by calling
// CreateConversation again on the already-persisted row — a duplicate-key INSERT
// that failed silently, so the auto-generated title was never saved.
// UpdateConversationTitle must actually persist the title (and be owner-scoped).
func TestAIRepo_UpdateConversationTitle(t *testing.T) {
	db := newAITestDB(t)
	repo := NewAIRepo(db)
	ctx := context.Background()

	conv := &model.AIConversation{UserID: 1, Title: ""}
	require.NoError(t, repo.CreateConversation(ctx, conv))
	require.NotZero(t, conv.ID)

	require.NoError(t, repo.UpdateConversationTitle(ctx, 1, conv.ID, "hello world"))

	got, err := repo.GetConversationByID(ctx, 1, conv.ID)
	require.NoError(t, err)
	assert.Equal(t, "hello world", got.Title)

	// Ownership scoping: another user cannot rename it.
	require.NoError(t, repo.UpdateConversationTitle(ctx, 2, conv.ID, "hacked"))
	got, _ = repo.GetConversationByID(ctx, 1, conv.ID)
	assert.Equal(t, "hello world", got.Title, "title unchanged for non-owner")
}

// ListRecentMessagesByConversation returns the most recent N messages in
// chronological order — a capped fetch so a long conversation doesn't reload
// every row (longtext content) on every chat turn.
func TestAIRepo_ListRecentMessagesByConversation(t *testing.T) {
	db := newAITestDB(t)
	repo := NewAIRepo(db)
	ctx := context.Background()
	conv := &model.AIConversation{UserID: 1, Title: "t"}
	require.NoError(t, repo.CreateConversation(ctx, conv))
	for _, c := range []string{"m1", "m2", "m3", "m4", "m5"} {
		require.NoError(t, db.Create(&model.AIMessage{
			ConversationID: conv.ID, Role: model.AIMessageUser, Content: c,
		}).Error)
	}

	// Last 3, in chronological order.
	got, err := repo.ListRecentMessagesByConversation(ctx, conv.ID, 3)
	require.NoError(t, err)
	require.Len(t, got, 3)
	assert.Equal(t, []string{"m3", "m4", "m5"}, []string{got[0].Content, got[1].Content, got[2].Content})

	// Limit larger than available -> all, chronological.
	got, err = repo.ListRecentMessagesByConversation(ctx, conv.ID, 100)
	require.NoError(t, err)
	require.Len(t, got, 5)
	assert.Equal(t, "m1", got[0].Content)
	assert.Equal(t, "m5", got[4].Content)
}
