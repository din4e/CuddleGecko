package repository

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// ReminderRepo.List gained a contactID filter so ContactDetailPage can fetch
// only a contact's reminders server-side instead of loading the workspace's
// (up to 200) and filtering in JS.
func TestReminderRepo_List_ContactFilter(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Reminder{}))
	repo := NewReminderRepo(db)
	ctx := context.Background()
	now := time.Now()

	mk := func(contactID uint, title string) {
		require.NoError(t, db.Create(&model.Reminder{
			UserID: 1, WorkspaceID: 1, ContactID: contactID, Title: title,
			RemindAt: now, Status: model.ReminderPending,
		}).Error)
	}
	mk(1, "for-1-a")
	mk(1, "for-1-b")
	mk(2, "for-2")
	mk(3, "for-3")

	c1 := uint(1)
	reminders, total, err := repo.List(ctx, 1, "", &c1, 1, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, reminders, 2)

	// No contact filter -> all reminders.
	_, total, err = repo.List(ctx, 1, "", nil, 1, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)

	// A contact with no reminders -> empty.
	c99 := uint(99)
	_, total, err = repo.List(ctx, 1, "", &c99, 1, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
}
