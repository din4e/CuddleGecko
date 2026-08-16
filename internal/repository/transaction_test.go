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

func newTransactionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Transaction{}))
	return db
}

func ptrUint(v uint) *uint { return &v }

// Regression: the contact_id query filter used to reference a non-existent
// scalar column. Transactions store their buddies as a JSON array in
// contact_ids, so the filter must test array membership.
func TestTransactionRepo_List_ContactIDFilter(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws uint = 1
	day := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	create := func(title string, cids []uint) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID:      1,
			WorkspaceID: ws,
			Title:       title,
			Amount:      10,
			Type:        "expense",
			ContactIDs:  cids,
			Date:        day,
		}))
	}

	create("shared", []uint{5, 7})  // contains contact 5
	create("other", []uint{9})      // does not contain 5
	create("none", []uint{})        // no buddies
	create("solo", []uint{5})       // contains contact 5

	// Filter by contact 5 -> only the two transactions that include it.
	txs, total, err := repo.List(ctx, ws, 1, 100, nil, ptrUint(5), "")
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, txs, 2)
	assert.ElementsMatch(t, []string{"shared", "solo"}, []string{txs[0].Title, txs[1].Title})

	// Filter by a contact nobody shares -> empty, no error.
	txs, total, err = repo.List(ctx, ws, 1, 100, nil, ptrUint(999), "")
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.Empty(t, txs)

	// No contact filter -> all transactions in the workspace.
	_, total, err = repo.List(ctx, ws, 1, 100, nil, nil, "")
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)

	// Title search is a case-insensitive substring match.
	txs, total, err = repo.List(ctx, ws, 1, 100, nil, nil, "SOL")
	require.NoError(t, err)
	assert.Equal(t, int64(1), total, "search should match only 'solo'")
	require.Len(t, txs, 1)
	assert.Equal(t, "solo", txs[0].Title)
}

// TestTransactionRepo_Monthly verifies the per-month income/expense aggregate
// that backs the dashboard (replacing a 1000-row client fetch): it groups by
// month, splits income/expense, and only covers the requested window.
func TestTransactionRepo_Monthly(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws uint = 1
	now := time.Now()

	mk := func(amount float64, txType string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: 1, WorkspaceID: ws, Title: "t", Amount: amount, Type: txType, Date: when,
		}))
	}

	thisMonth := now.Format("2006-01")
	twoAgo := now.AddDate(0, -2, 0)

	mk(100, "income", time.Date(now.Year(), now.Month(), 15, 12, 0, 0, 0, now.Location()))
	mk(50, "expense", time.Date(now.Year(), now.Month(), 16, 12, 0, 0, 0, now.Location()))
	mk(200, "income", time.Date(twoAgo.Year(), twoAgo.Month(), 10, 12, 0, 0, 0, now.Location()))
	mk(999, "income", now.AddDate(0, -10, 0)) // outside the 6-month window

	rows, err := repo.Monthly(ctx, ws, 6)
	require.NoError(t, err)

	byMonth := make(map[string]model.TransactionMonthly, len(rows))
	for _, r := range rows {
		byMonth[r.Month] = r
	}

	cur, ok := byMonth[thisMonth]
	require.True(t, ok, "current-month bucket present")
	assert.InDelta(t, 100.0, cur.Income, 0.0001)
	assert.InDelta(t, 50.0, cur.Expense, 0.0001)

	prev, ok := byMonth[twoAgo.Format("2006-01")]
	require.True(t, ok, "two-months-ago bucket present")
	assert.InDelta(t, 200.0, prev.Income, 0.0001)
	assert.InDelta(t, 0.0, prev.Expense, 0.0001)

	// The 10-month-old transaction is outside the 6-month window.
	_, present := byMonth[now.AddDate(0, -10, 0).Format("2006-01")]
	assert.False(t, present, "out-of-window month must be excluded")
}

// Regression: ListByContactIDs used to load the workspace's most-recent N
// transactions and filter in Go, so the LIMIT biased the sample (older matches
// for less-active contacts were missed). It now filters in SQL, then limits —
// returning only matching rows, with the limit applied to matches.
func TestTransactionRepo_ListByContactIDs_SQLFilter(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	mk := func(cids []uint, title string) {
		require.NoError(t, db.Create(&model.Transaction{
			UserID: 1, WorkspaceID: 1, Title: title, Amount: 10, Type: "expense",
			ContactIDs: cids, Date: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		}).Error)
	}
	mk([]uint{1}, "c1-a")
	mk([]uint{1}, "c1-b")
	mk([]uint{1}, "c1-c")
	mk([]uint{2}, "c2-a")
	mk([]uint{2}, "c2-b")
	mk([]uint{3}, "c3") // not in the query set
	mk([]uint{}, "none")

	// No limit -> all 5 matching (3 for contact 1 + 2 for contact 2); the old
	// impl would also have returned these only by luck of row order.
	got, err := repo.ListByContactIDs(ctx, 1, []uint{1, 2}, 0)
	require.NoError(t, err)
	assert.Len(t, got, 5, "should return exactly the matching transactions")
	for _, tx := range got {
		assert.NotContains(t, []string{"c3", "none"}, tx.Title, "non-matching tx must be excluded")
	}

	// Limit applies to MATCHES, not to a pre-filter sample.
	got, err = repo.ListByContactIDs(ctx, 1, []uint{1, 2}, 2)
	require.NoError(t, err)
	assert.Len(t, got, 2, "limit should bound the matching set")

	// Empty contactIDs -> nil, no error.
	got, err = repo.ListByContactIDs(ctx, 1, nil, 0)
	require.NoError(t, err)
	assert.Empty(t, got)
}
