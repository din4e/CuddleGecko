package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type FinanceSnapshotRepo struct {
	db *gorm.DB
}

func NewFinanceSnapshotRepo(db *gorm.DB) *FinanceSnapshotRepo {
	return &FinanceSnapshotRepo{db: db}
}

// ImportBundle replaces, in one transaction, every row whose date appears in
// the incoming slices (delete-then-insert, mirroring finance-web's own import
// semantics). Re-running the same push is idempotent: same dates, same rows.
// Dates are normalized to UTC midnight so the unique index sees one row per
// calendar day regardless of the pushed timestamp's time-of-day.
func (r *FinanceSnapshotRepo) ImportBundle(ctx context.Context, workspaceID uint, snapshots []model.FinanceSnapshot, accounts []model.FinanceSnapshotAccount, mortgages []model.FinanceMortgage) error {
	dates := map[string]time.Time{}
	collect := func(t time.Time) {
		dates[t.UTC().Format("2006-01-02")] = time.Date(t.UTC().Year(), t.UTC().Month(), t.UTC().Day(), 0, 0, 0, 0, time.UTC)
	}
	for _, s := range snapshots {
		collect(s.Date)
	}
	for _, a := range accounts {
		collect(a.Date)
	}
	for _, m := range mortgages {
		collect(m.Date)
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for d := range dates {
			day := dates[d]
			if err := tx.Where("workspace_id = ? AND date >= ? AND date < ?", workspaceID, day, day.AddDate(0, 0, 1)).
				Delete(&model.FinanceSnapshot{}).Error; err != nil {
				return fmt.Errorf("delete finance snapshots %s: %w", d, err)
			}
			if err := tx.Where("workspace_id = ? AND date >= ? AND date < ?", workspaceID, day, day.AddDate(0, 0, 1)).
				Delete(&model.FinanceSnapshotAccount{}).Error; err != nil {
				return fmt.Errorf("delete finance snapshot accounts %s: %w", d, err)
			}
			if err := tx.Where("workspace_id = ? AND date >= ? AND date < ?", workspaceID, day, day.AddDate(0, 0, 1)).
				Delete(&model.FinanceMortgage{}).Error; err != nil {
				return fmt.Errorf("delete finance mortgages %s: %w", d, err)
			}
		}

		for i := range snapshots {
			snapshots[i].WorkspaceID = workspaceID
			snapshots[i].Date = dates[snapshots[i].Date.UTC().Format("2006-01-02")]
			if err := tx.Create(&snapshots[i]).Error; err != nil {
				return fmt.Errorf("insert finance snapshot: %w", err)
			}
		}
		for i := range accounts {
			accounts[i].WorkspaceID = workspaceID
			accounts[i].Date = dates[accounts[i].Date.UTC().Format("2006-01-02")]
			if err := tx.Create(&accounts[i]).Error; err != nil {
				return fmt.Errorf("insert finance snapshot account: %w", err)
			}
		}
		for i := range mortgages {
			mortgages[i].WorkspaceID = workspaceID
			mortgages[i].Date = dates[mortgages[i].Date.UTC().Format("2006-01-02")]
			if err := tx.Create(&mortgages[i]).Error; err != nil {
				return fmt.Errorf("insert finance mortgage: %w", err)
			}
		}
		return nil
	})
}

// ListSnapshots returns the whole net-worth series, oldest first.
func (r *FinanceSnapshotRepo) ListSnapshots(ctx context.Context, workspaceID uint) ([]model.FinanceSnapshot, error) {
	var rows []model.FinanceSnapshot
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("date ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list finance snapshots: %w", err)
	}
	return rows, nil
}

// ListAccounts returns one snapshot day's account rows — for `date` when
// given, else for the latest day that has any.
func (r *FinanceSnapshotRepo) ListAccounts(ctx context.Context, workspaceID uint, date *time.Time) ([]model.FinanceSnapshotAccount, error) {
	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if date != nil {
		day := time.Date(date.UTC().Year(), date.UTC().Month(), date.UTC().Day(), 0, 0, 0, 0, time.UTC)
		query = query.Where("date >= ? AND date < ?", day, day.AddDate(0, 0, 1))
	} else {
		query = query.Where("date = (SELECT MAX(date) FROM finance_snapshot_accounts WHERE workspace_id = ?)", workspaceID)
	}
	var rows []model.FinanceSnapshotAccount
	if err := query.Order("type ASC, name ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list finance snapshot accounts: %w", err)
	}
	return rows, nil
}

// ListMortgages returns the mortgage trend, oldest first.
func (r *FinanceSnapshotRepo) ListMortgages(ctx context.Context, workspaceID uint) ([]model.FinanceMortgage, error) {
	var rows []model.FinanceMortgage
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("date ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list finance mortgages: %w", err)
	}
	return rows, nil
}
