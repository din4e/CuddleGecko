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

func newRelationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.ContactRelation{}))
	return db
}

// The OR(contact_id_a, contact_id_b) query was rewritten as a UNION of two
// index-backed SELECTs. This locks in that it still returns every relation
// touching the contact (either side), dedups self-relations, and accepts a set
// of ids.
func TestRelationRepo_ListByContact_Union(t *testing.T) {
	db := newRelationTestDB(t)
	repo := NewRelationRepo(db)
	ctx := context.Background()
	mk := func(a, b uint) {
		require.NoError(t, repo.Create(ctx, &model.ContactRelation{UserID: 1, WorkspaceID: 1, ContactIDA: a, ContactIDB: b}))
	}
	mk(1, 2) // 1 is contact_id_a
	mk(3, 1) // 1 is contact_id_b
	mk(4, 5) // unrelated
	mk(1, 1) // self-relation on 1 — must appear once, not twice

	rels, err := repo.ListByContact(ctx, 1, 1)
	require.NoError(t, err)
	assert.Len(t, rels, 3, "matches a-side, b-side, and self (deduped)")

	// A set of ids matches across both columns.
	rels, err = repo.ListByContactIDs(ctx, 1, []uint{1, 5})
	require.NoError(t, err)
	assert.Len(t, rels, 4, "1 matches three relations, 5 matches one")

	// Empty id set -> empty result (no SQL error).
	rels, err = repo.ListByContactIDs(ctx, 1, nil)
	require.NoError(t, err)
	assert.Empty(t, rels)
}
