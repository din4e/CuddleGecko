package repository

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestContactRepoListTagFilterDoesNotDuplicateContacts(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Contact{}, &model.Tagging{}))

	ctx := context.Background()
	contact := model.Contact{WorkspaceID: 1, UserID: 1, Name: "Ada"}
	require.NoError(t, db.WithContext(ctx).Create(&contact).Error)
	require.NoError(t, db.WithContext(ctx).Create(&model.Tagging{WorkspaceID: 1, TagID: 1, TargetType: model.TagTargetContact, TargetID: contact.ID}).Error)
	require.NoError(t, db.WithContext(ctx).Create(&model.Tagging{WorkspaceID: 1, TagID: 2, TargetType: model.TagTargetContact, TargetID: contact.ID}).Error)

	contacts, total, err := NewContactRepo(db).List(ctx, 1, 1, 20, "", []uint{1, 2})
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, contacts, 1)
	require.Equal(t, contact.ID, contacts[0].ID)
}
