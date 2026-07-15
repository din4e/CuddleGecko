package repository

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTransactionTestRepo(t *testing.T) *TransactionRepo {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Transaction{}); err != nil {
		t.Fatalf("migrate transactions: %v", err)
	}
	return NewTransactionRepo(db)
}

func TestTransactionRepoListFiltersSerializedContactIDs(t *testing.T) {
	repo := newTransactionTestRepo(t)
	now := time.Now().UTC()
	txs := []model.Transaction{
		{WorkspaceID: 1, Title: "Shared", Amount: 10, Type: "income", ContactIDs: []uint{1, 10}, Date: now},
		{WorkspaceID: 1, Title: "Other", Amount: 20, Type: "expense", ContactIDs: []uint{11}, Date: now},
	}
	for i := range txs {
		if err := repo.Create(context.Background(), &txs[i]); err != nil {
			t.Fatalf("create transaction: %v", err)
		}
	}

	contactID := uint(1)
	got, total, err := repo.List(context.Background(), 1, 1, 20, nil, &contactID)
	if err != nil {
		t.Fatalf("list transactions: %v", err)
	}
	if total != 1 || len(got) != 1 || got[0].Title != "Shared" {
		t.Fatalf("expected only the linked transaction, got total=%d transactions=%+v", total, got)
	}
}

func TestTransactionRepoMonthlyTrendAggregatesByMonthAndType(t *testing.T) {
	repo := newTransactionTestRepo(t)
	month := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	txs := []model.Transaction{
		{WorkspaceID: 1, Title: "Salary", Amount: 100, Type: "income", Date: month.AddDate(0, 0, 2)},
		{WorkspaceID: 1, Title: "Gift", Amount: 20, Type: "income", Date: month.AddDate(0, 0, 3)},
		{WorkspaceID: 1, Title: "Food", Amount: 35, Type: "expense", Date: month.AddDate(0, 0, 4)},
		{WorkspaceID: 1, Title: "Old", Amount: 99, Type: "expense", Date: month.AddDate(0, -1, 4)},
	}
	for i := range txs {
		if err := repo.Create(context.Background(), &txs[i]); err != nil {
			t.Fatalf("create transaction: %v", err)
		}
	}

	points, err := repo.MonthlyTrend(context.Background(), 1, month)
	if err != nil {
		t.Fatalf("get monthly trend: %v", err)
	}
	amounts := make(map[string]float64, len(points))
	for _, point := range points {
		amounts[point.Month+":"+point.Type] = point.Amount
	}
	if amounts["2026-07:income"] != 120 || amounts["2026-07:expense"] != 35 || len(amounts) != 2 {
		t.Fatalf("unexpected trend points: %+v", points)
	}
}
