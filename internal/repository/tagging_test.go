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

func newTaggingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Tag{}, &model.Tagging{}, &model.Event{}, &model.Habit{}, &model.Reminder{}, &model.Transaction{}, &model.Workout{}))
	return db
}

func TestTaggingRepo_SetTagsValidatesWorkspaceAndReplacesAtomically(t *testing.T) {
	db := newTaggingTestDB(t)
	repo := NewTaggingRepo(db)
	ctx := context.Background()

	own := model.Tag{UserID: 1, WorkspaceID: 1, Name: "own"}
	foreign := model.Tag{UserID: 2, WorkspaceID: 2, Name: "foreign"}
	for _, tag := range []*model.Tag{&own, &foreign} {
		require.NoError(t, db.Create(tag).Error)
	}

	// Foreign or missing ids are rejected and nothing is written.
	for _, bad := range [][]uint{{foreign.ID}, {9999}} {
		require.ErrorIs(t, repo.SetTags(ctx, 1, model.TagTargetEvent, 7, bad), model.ErrInvalidTagIDs)
		tags, err := repo.GetTags(ctx, 1, model.TagTargetEvent, 7)
		require.NoError(t, err)
		assert.Empty(t, tags)
	}

	// Duplicates and zeros collapse into one association.
	require.NoError(t, repo.SetTags(ctx, 1, model.TagTargetEvent, 7, []uint{own.ID, own.ID, 0}))
	tags, err := repo.GetTags(ctx, 1, model.TagTargetEvent, 7)
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, own.ID, tags[0].ID)

	// A later replace with an invalid id keeps the previous set untouched.
	require.ErrorIs(t, repo.SetTags(ctx, 1, model.TagTargetEvent, 7, []uint{foreign.ID}), model.ErrInvalidTagIDs)
	tags, err = repo.GetTags(ctx, 1, model.TagTargetEvent, 7)
	require.NoError(t, err)
	assert.Len(t, tags, 1)

	// Empty list clears.
	require.NoError(t, repo.SetTags(ctx, 1, model.TagTargetEvent, 7, nil))
	tags, err = repo.GetTags(ctx, 1, model.TagTargetEvent, 7)
	require.NoError(t, err)
	assert.Empty(t, tags)

	require.NoError(t, repo.RemoveAll(ctx, 1, model.TagTargetEvent, 7))
}

// Every newly taggable entity filters its List by tag and enriches rows with
// the virtual Tags field; events stand in for the shared mechanism.
func TestTaggingRepo_FilterTargetIDsScopesByTargetType(t *testing.T) {
	db := newTaggingTestDB(t)
	repo := NewTaggingRepo(db)
	ctx := context.Background()

	tag := model.Tag{UserID: 1, WorkspaceID: 1, Name: "work"}
	require.NoError(t, db.Create(&tag).Error)
	// Same tag on an event and a habit; only events match the event filter.
	require.NoError(t, repo.SetTags(ctx, 1, model.TagTargetEvent, 11, []uint{tag.ID}))
	require.NoError(t, repo.SetTags(ctx, 1, model.TagTargetHabit, 12, []uint{tag.ID}))

	ids, err := repo.FilterTargetIDs(ctx, 1, model.TagTargetEvent, []uint{tag.ID})
	require.NoError(t, err)
	assert.Equal(t, []uint{11}, ids)

	byTargets, err := repo.GetTagsByTargets(ctx, 1, model.TagTargetEvent, []uint{11, 12})
	require.NoError(t, err)
	assert.Len(t, byTargets[11], 1)
	assert.Nil(t, byTargets[12])
}
