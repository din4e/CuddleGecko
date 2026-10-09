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

func ptrString(v string) *string { return &v }

// Regression: the contact_id query filter used to reference a non-existent
// scalar column. Transactions store their buddies as a JSON array in
// contact_ids, so the filter must test array membership.
func TestTransactionRepo_List_ContactIDFilter(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws = "1"
	day := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	create := func(title string, cids []string) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID:      "1",
			WorkspaceID: ws,
			Title:       title,
			Amount:      10,
			Type:        "expense",
			ContactIDs:  cids,
			Date:        day,
		}))
	}

	create("shared", []string{"5", "7"}) // contains contact "5"
	create("other", []string{"9"})     // does not contain 5
	create("none", []string{})         // no buddies
	create("solo", []string{"5"})      // contains contact "5"

	// Filter by contact 5 -> only the two transactions that include it.
	txs, total, err := repo.List(ctx, ws, 1, 100, nil, ptrString("5"), "", nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, txs, 2)
	assert.ElementsMatch(t, []string{"shared", "solo"}, []string{txs[0].Title, txs[1].Title})

	// Filter by a contact nobody shares -> empty, no error.
	txs, total, err = repo.List(ctx, ws, 1, 100, nil, ptrString("999"), "", nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.Empty(t, txs)

	// No contact filter -> all transactions in the workspace.
	_, total, err = repo.List(ctx, ws, 1, 100, nil, nil, "", nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)

	// Title search is a case-insensitive substring match.
	txs, total, err = repo.List(ctx, ws, 1, 100, nil, nil, "SOL", nil, nil, nil)
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
	const ws = "1"
	now := time.Now()

	mk := func(amount float64, txType string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: "1", WorkspaceID: ws, Title: "t", Amount: amount, Type: txType, Date: when,
		}))
	}

	thisMonth := now.Format("2006-01")
	twoAgo := now.AddDate(0, -2, 0)

	mk(100, "income", time.Date(now.Year(), now.Month(), 15, 12, 0, 0, 0, now.Location()))
	mk(50, "expense", time.Date(now.Year(), now.Month(), 16, 12, 0, 0, 0, now.Location()))
	mk(200, "income", time.Date(twoAgo.Year(), twoAgo.Month(), 10, 12, 0, 0, 0, now.Location()))
	mk(999, "income", now.AddDate(0, -10, 0)) // outside the 6-month window

	rows, err := repo.Monthly(ctx, ws, 6, nil, nil)
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

// TestTransactionRepo_Monthly_Range verifies the ranged mode behind the finance
// page's year selector: with from/to (half-open [from, to)) the aggregate
// covers the explicit range and ignores `months`, with boundary-day rows
// included on `from` and excluded once past `to`.
func TestTransactionRepo_Monthly_Range(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws = "1"

	mk := func(amount float64, txType string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: "1", WorkspaceID: ws, Title: "t", Amount: amount, Type: txType, Date: when,
		}))
	}

	mk(100, "income", time.Date(2025, 12, 31, 12, 0, 0, 0, time.UTC)) // before `from`
	mk(700, "income", time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC))
	mk(90, "expense", time.Date(2026, 2, 15, 12, 0, 0, 0, time.UTC))
	mk(300, "income", time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC)) // last day of range
	mk(999, "expense", time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC))   // on exclusive `to`

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)

	// months is ignored in ranged mode — same rows with 1 or 6.
	for _, months := range []int{1, 6} {
		rows, err := repo.Monthly(ctx, ws, months, &from, &to)
		require.NoError(t, err)
		require.Len(t, rows, 2, "months=%d: one bucket per month with data in 2026", months)
		assert.Equal(t, "2026-02", rows[0].Month)
		assert.InDelta(t, 700.0, rows[0].Income, 0.0001)
		assert.InDelta(t, 90.0, rows[0].Expense, 0.0001)
		assert.Equal(t, "2026-12", rows[1].Month)
		assert.InDelta(t, 300.0, rows[1].Income, 0.0001)
		assert.InDelta(t, 0.0, rows[1].Expense, 0.0001)
	}
}

// TestTransactionRepo_Yearly verifies the per-year income/expense aggregate
// behind the finance page's year selector: buckets follow the stored date's
// year (substr on the stored text, not a UTC re-format) across multiple years.
func TestTransactionRepo_Yearly(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws = "1"

	mk := func(amount float64, txType, category string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: "1", WorkspaceID: ws, Title: "t", Amount: amount, Type: txType,
			Category: category, Date: when,
		}))
	}

	// Jan-1 00:00 UTC mirrors the push-cg imported annual-plan rows.
	mk(100, "income", "我的", time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC))
	mk(40, "expense", "我的", time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC))
	mk(200, "income", "爸妈", time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC))
	mk(650, "income", "我的", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	mk(300, "expense", "", time.Date(2026, 9, 2, 8, 30, 0, 0, time.UTC))

	rows, err := repo.Yearly(ctx, ws)
	require.NoError(t, err)
	require.Len(t, rows, 3, "one bucket per year with data")
	assert.Equal(t, "2024", rows[0].Year)
	assert.InDelta(t, 100.0, rows[0].Income, 0.0001)
	assert.InDelta(t, 40.0, rows[0].Expense, 0.0001)
	assert.Equal(t, "2025", rows[1].Year)
	assert.InDelta(t, 200.0, rows[1].Income, 0.0001)
	assert.Equal(t, "2026", rows[2].Year)
	assert.InDelta(t, 650.0, rows[2].Income, 0.0001)
	assert.InDelta(t, 300.0, rows[2].Expense, 0.0001)
}

// TestTransactionRepo_CategoryTotals verifies the per-category breakdown:
// single-pass income/expense split, optional [from, to) window, and DESC
// ordering by total volume.
func TestTransactionRepo_CategoryTotals(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws = "1"

	mk := func(amount float64, txType, category string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: "1", WorkspaceID: ws, Title: "t", Amount: amount, Type: txType,
			Category: category, Date: when,
		}))
	}

	day := func(year int, month time.Month) time.Time {
		return time.Date(year, month, 10, 12, 0, 0, 0, time.UTC)
	}
	mk(300, "income", "我的", day(2025, 3))
	mk(100, "expense", "我的", day(2026, 4))
	mk(500, "income", "爸妈", day(2025, 7))
	mk(80, "expense", "", day(2026, 8)) // uncategorized

	// All-time: 我的=400, 爸妈=500, ""=80 → DESC order 爸妈, 我的, "".
	rows, err := repo.CategoryTotals(ctx, ws, nil, nil)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	assert.Equal(t, "爸妈", rows[0].Category)
	assert.InDelta(t, 500.0, rows[0].Income, 0.0001)
	assert.Equal(t, "我的", rows[1].Category)
	assert.InDelta(t, 300.0, rows[1].Income, 0.0001)
	assert.InDelta(t, 100.0, rows[1].Expense, 0.0001)
	assert.Equal(t, "", rows[2].Category)
	assert.InDelta(t, 80.0, rows[2].Expense, 0.0001)

	// Windowed to 2026 only (half-open [2026-01-01, 2027-01-01)).
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	rows, err = repo.CategoryTotals(ctx, ws, &from, &to)
	require.NoError(t, err)
	require.Len(t, rows, 2, "2025 rows must be excluded by the window")
	for _, r := range rows {
		switch r.Category {
		case "我的":
			assert.InDelta(t, 0.0, r.Income, 0.0001)
			assert.InDelta(t, 100.0, r.Expense, 0.0001)
		case "":
			assert.InDelta(t, 80.0, r.Expense, 0.0001)
		default:
			t.Fatalf("unexpected category in windowed result: %q", r.Category)
		}
	}
}

// TestTransactionRepo_List_DateRange verifies the optional [from, to) bounds
// on List: boundary-day rows are included on `from` and excluded once past
// `to`, and nil bounds return everything (pre-range behavior).
func TestTransactionRepo_List_DateRange(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws = "1"

	mk := func(title string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: "1", WorkspaceID: ws, Title: title, Amount: 10, Type: "expense", Date: when,
		}))
	}
	mk("before", time.Date(2025, 12, 31, 23, 0, 0, 0, time.UTC))
	mk("first", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)) // exactly on `from`
	mk("mid", time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC))
	mk("last", time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC)) // last day of `to`

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC) // `to`-2026-12-31 advanced one day

	txs, total, err := repo.List(ctx, ws, 1, 100, nil, nil, "", nil, &from, &to)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	titles := []string{txs[0].Title, txs[1].Title, txs[2].Title}
	assert.ElementsMatch(t, []string{"first", "mid", "last"}, titles)

	// Nil bounds -> all rows, same as before the range filter existed.
	_, total, err = repo.List(ctx, ws, 1, 100, nil, nil, "", nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)
}

// TestTransactionRepo_Summary_Range verifies the summary aggregate honors the
// optional [from, to) window while nil bounds keep the all-time behavior.
func TestTransactionRepo_Summary_Range(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	const ws = "1"

	mk := func(amount float64, txType string, when time.Time) {
		require.NoError(t, repo.Create(ctx, &model.Transaction{
			UserID: "1", WorkspaceID: ws, Title: "t", Amount: amount, Type: txType, Date: when,
		}))
	}
	mk(100, "income", time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC))
	mk(700, "income", time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC))
	mk(90, "expense", time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC))

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	income, expense, err := repo.Summary(ctx, ws, &from, &to)
	require.NoError(t, err)
	assert.InDelta(t, 700.0, income, 0.0001)
	assert.InDelta(t, 90.0, expense, 0.0001)

	income, expense, err = repo.Summary(ctx, ws, nil, nil)
	require.NoError(t, err)
	assert.InDelta(t, 800.0, income, 0.0001)
	assert.InDelta(t, 90.0, expense, 0.0001)
}

// Regression: ListByContactIDs used to load the workspace's most-recent N
// transactions and filter in Go, so the LIMIT biased the sample (older matches
// for less-active contacts were missed). It now filters in SQL, then limits —
// returning only matching rows, with the limit applied to matches.
func TestTransactionRepo_ListByContactIDs_SQLFilter(t *testing.T) {
	db := newTransactionTestDB(t)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	mk := func(cids []string, title string) {
		require.NoError(t, db.Create(&model.Transaction{
			UserID: "1", WorkspaceID: "1", Title: title, Amount: 10, Type: "expense",
			ContactIDs: cids, Date: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		}).Error)
	}
	mk([]string{"1"}, "c1-a")
	mk([]string{"1"}, "c1-b")
	mk([]string{"1"}, "c1-c")
	mk([]string{"2"}, "c2-a")
	mk([]string{"2"}, "c2-b")
	mk([]string{"3"}, "c3") // not in the query set
	mk([]string{}, "none")

	// No limit -> all 5 matching (3 for contact 1 + 2 for contact 2); the old
	// impl would also have returned these only by luck of row order.
	got, err := repo.ListByContactIDs(ctx, "1", []string{"1", "2"}, 0)
	require.NoError(t, err)
	assert.Len(t, got, 5, "should return exactly the matching transactions")
	for _, tx := range got {
		assert.NotContains(t, []string{"c3", "none"}, tx.Title, "non-matching tx must be excluded")
	}

	// Limit applies to MATCHES, not to a pre-filter sample.
	got, err = repo.ListByContactIDs(ctx, "1", []string{"1", "2"}, 2)
	require.NoError(t, err)
	assert.Len(t, got, 2, "limit should bound the matching set")

	// Empty contactIDs -> nil, no error.
	got, err = repo.ListByContactIDs(ctx, "1", nil, 0)
	require.NoError(t, err)
	assert.Empty(t, got)
}
