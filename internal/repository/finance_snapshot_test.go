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

func newFinanceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.FinanceSnapshot{}, &model.FinanceSnapshotAccount{}, &model.FinanceMortgage{}))
	return db
}

// TestFinanceSnapshotRepo_ImportBundle_Idempotent verifies the delete+insert
// upsert semantics: re-pushing the same dates replaces rows instead of
// duplicating them, dates normalize to UTC midnight, and unrelated dates
// survive.
func TestFinanceSnapshotRepo_ImportBundle_Idempotent(t *testing.T) {
	db := newFinanceTestDB(t)
	repo := NewFinanceSnapshotRepo(db)
	ctx := context.Background()
	const ws uint = 1

	day1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)

	push := func(assets float64, accName string) {
		require.NoError(t, repo.ImportBundle(ctx, ws,
			[]model.FinanceSnapshot{{Date: day1, Assets: assets, Debt: 100, NetWorth: assets - 100}, {Date: day2, Assets: 1, Debt: 1, NetWorth: 0}},
			[]model.FinanceSnapshotAccount{{Date: day1, Name: accName, Available: 5, Type: "流通"}},
			[]model.FinanceMortgage{{Date: day1, Remaining: 900, Monthly: 7}},
		))
	}

	push(500, "招行")
	push(600, "招行改") // same dates, updated values

	snaps, err := repo.ListSnapshots(ctx, ws)
	require.NoError(t, err)
	require.Len(t, snaps, 2, "same dates must not duplicate")
	assert.True(t, snaps[0].Date.Equal(day1))
	assert.InDelta(t, 600.0, snaps[0].Assets, 0.0001, "re-push replaces values")

	accs, err := repo.ListAccounts(ctx, ws, nil)
	require.NoError(t, err)
	require.Len(t, accs, 1, "account rows for the date are replaced, not appended")
	assert.Equal(t, "招行改", accs[0].Name)

	morts, err := repo.ListMortgages(ctx, ws)
	require.NoError(t, err)
	require.Len(t, morts, 1)
	assert.InDelta(t, 900.0, morts[0].Remaining, 0.0001)

	// Workspace isolation: another workspace sees nothing.
	other, err := repo.ListSnapshots(ctx, 2)
	require.NoError(t, err)
	assert.Empty(t, other)
}

// TestFinanceSnapshotRepo_ListAccounts_DateFilter verifies the explicit-date
// path (and midnight normalization of the requested day).
func TestFinanceSnapshotRepo_ListAccounts_DateFilter(t *testing.T) {
	db := newFinanceTestDB(t)
	repo := NewFinanceSnapshotRepo(db)
	ctx := context.Background()
	const ws uint = 1

	d1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	d2 := time.Date(2026, 9, 19, 0, 0, 0, 0, time.UTC)
	require.NoError(t, repo.ImportBundle(ctx, ws,
		[]model.FinanceSnapshot{{Date: d1}, {Date: d2}},
		[]model.FinanceSnapshotAccount{
			{Date: d1, Name: "旧账户", Type: "流通"},
			{Date: d2, Name: "新账户", Type: "流通"},
		},
		nil,
	))

	// Explicit date → that day's rows only.
	asked := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	accs, err := repo.ListAccounts(ctx, ws, &asked)
	require.NoError(t, err)
	require.Len(t, accs, 1)
	assert.Equal(t, "旧账户", accs[0].Name)

	// No date → latest day.
	accs, err = repo.ListAccounts(ctx, ws, nil)
	require.NoError(t, err)
	require.Len(t, accs, 1)
	assert.Equal(t, "新账户", accs[0].Name)
}
