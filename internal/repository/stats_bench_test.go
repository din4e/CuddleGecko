package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// Benchmarks for the single-pass Stats/Monthly rewrites (iters 1 & 12). These
// are the dashboard's hot paths — the rewrite replaced 6–7 sequential COUNT
// queries per call with one scan; these numbers let future changes to those
// methods be compared before/after.

func benchDB(b *testing.B, models ...any) *gorm.DB {
	b.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(b, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	require.NoError(b, db.AutoMigrate(models...))
	return db
}

func benchSeedTodos(b *testing.B, db *gorm.DB, n int) {
	b.Helper()
	batch := 500
	now := time.Now()
	items := make([]model.Todo, 0, batch)
	for i := 0; i < n; i++ {
		status := "pending"
		if i%3 == 0 {
			status = "done"
		}
		items = append(items, model.Todo{
			UserID: 1, WorkspaceID: 1,
			Title: fmt.Sprintf("todo %d", i), Status: status, Priority: "normal",
			DueTime: &now,
		})
		if len(items) == batch {
			require.NoError(b, db.Create(&items).Error)
			items = items[:0]
		}
	}
	if len(items) > 0 {
		require.NoError(b, db.Create(&items).Error)
	}
}

func BenchmarkTodoStats(b *testing.B) {
	db := benchDB(b, &model.Todo{})
	benchSeedTodos(b, db, 1000)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := repo.Stats(ctx, 1); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkWorkoutStats(b *testing.B) {
	db := benchDB(b, &model.Workout{})
	now := time.Now()
	batch := make([]model.Workout, 0, 500)
	for i := 0; i < 1000; i++ {
		batch = append(batch, model.Workout{
			UserID: 1, WorkspaceID: 1,
			Name: fmt.Sprintf("w %d", i), Type: "strength",
			Status: model.WorkoutStatusCompleted, ScheduledAt: &now,
		})
	}
	require.NoError(b, db.CreateInBatches(batch, 500).Error)
	repo := NewWorkoutRepo(db)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := repo.Stats(ctx, 1); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkTransactionMonthly(b *testing.B) {
	db := benchDB(b, &model.Transaction{})
	batch := make([]model.Transaction, 0, 500)
	for i := 0; i < 1000; i++ {
		ty := "income"
		if i%2 == 0 {
			ty = "expense"
		}
		batch = append(batch, model.Transaction{
			UserID: 1, WorkspaceID: 1,
			Title: fmt.Sprintf("tx %d", i), Amount: 10, Type: ty,
			Date: time.Now().AddDate(0, 0, -i%180),
		})
	}
	require.NoError(b, db.CreateInBatches(batch, 500).Error)
	repo := NewTransactionRepo(db)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := repo.Monthly(ctx, 1, 6); err != nil {
			b.Fatal(err)
		}
	}
}
