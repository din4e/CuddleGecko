package service

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// Events exercise the whole polymorphic tagging path shared by events,
// transactions, workouts, habits and reminders: ownership check on replace,
// workspace-scoped tag validation, list filtering and Tags enrichment.
func TestEventService_TagsLifecycle(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Event{}, &model.Tag{}, &model.Tagging{}))

	taggingRepo := repository.NewTaggingRepo(db)
	svc := NewEventService(repository.NewEventRepo(db), taggingRepo)
	tagSvc := NewTagService(repository.NewTagRepo(db))
	ctx := context.Background()

	work, err := tagSvc.Create(ctx, 1, 1, &model.Tag{Name: "work", Color: "#22c55e"})
	require.NoError(t, err)
	foreign, err := tagSvc.Create(ctx, 2, 2, &model.Tag{Name: "other-ws"})
	require.NoError(t, err)

	event, err := svc.Create(ctx, 1, 1, &model.Event{Title: "sync", StartTime: time.Now()})
	require.NoError(t, err)

	// Foreign and missing tag ids are rejected (400 material), not silently kept.
	require.ErrorIs(t, svc.ReplaceTags(ctx, 1, 1, event.ID, []uint{foreign.ID}), model.ErrInvalidTagIDs)
	require.ErrorIs(t, svc.ReplaceTags(ctx, 1, 1, event.ID, []uint{999}), model.ErrInvalidTagIDs)

	require.NoError(t, svc.ReplaceTags(ctx, 1, 1, event.ID, []uint{work.ID, work.ID}))
	tags, err := svc.GetTags(ctx, 1, 1, event.ID)
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, work.ID, tags[0].ID)

	// List enriches rows and filters by tag; the other workspace sees nothing.
	other, err := svc.Create(ctx, 1, 1, &model.Event{Title: "no tags", StartTime: time.Now()})
	require.NoError(t, err)

	untagged, total, err := svc.List(ctx, 1, 1, 1, 20, nil, nil, "", []uint{work.ID})
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, untagged, 1)
	assert.Equal(t, event.ID, untagged[0].ID)
	require.Len(t, untagged[0].Tags, 1)

	all, _, err := svc.List(ctx, 1, 1, 1, 20, nil, nil, "", nil)
	require.NoError(t, err)
	for _, e := range all {
		if e.ID == event.ID {
			assert.Len(t, e.Tags, 1)
		} else {
			assert.Empty(t, e.Tags, "event %d (%s)", e.ID, e.Title)
		}
	}
	_ = other

	// Deleting the event drops its taggings.
	require.NoError(t, svc.Delete(ctx, 1, 1, event.ID))
	var count int64
	require.NoError(t, db.Model(&model.Tagging{}).Where("target_type = ? AND target_id = ?", model.TagTargetEvent, event.ID).Count(&count).Error)
	assert.Zero(t, count)

	// Tags on a deleted target are gone from GetTags too.
	_, err = svc.GetTags(ctx, 1, 1, event.ID)
	assert.ErrorIs(t, err, ErrEventNotFound)
}
