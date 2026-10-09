package service

import (
	"context"
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrInvalidFinanceImport = errors.New("invalid finance import payload")

type FinanceSnapshotRepository interface {
	ImportBundle(ctx context.Context, workspaceID string, snapshots []model.FinanceSnapshot, accounts []model.FinanceSnapshotAccount, mortgages []model.FinanceMortgage) error
	ListSnapshots(ctx context.Context, workspaceID string) ([]model.FinanceSnapshot, error)
	ListAccounts(ctx context.Context, workspaceID string, date *time.Time) ([]model.FinanceSnapshotAccount, error)
	ListMortgages(ctx context.Context, workspaceID string) ([]model.FinanceMortgage, error)
}

type FinanceSnapshotService struct {
	repo FinanceSnapshotRepository
}

func NewFinanceSnapshotService(repo FinanceSnapshotRepository) *FinanceSnapshotService {
	return &FinanceSnapshotService{repo: repo}
}

// Import validates and replaces every pushed date's rows in one transaction.
// A bundle may omit any of the three slices; at least one row overall is
// required so an empty push can't wipe data unnoticed.
func (s *FinanceSnapshotService) Import(ctx context.Context, userID, workspaceID string, snapshots []model.FinanceSnapshot, accounts []model.FinanceSnapshotAccount, mortgages []model.FinanceMortgage) error {
	if len(snapshots) == 0 && len(accounts) == 0 && len(mortgages) == 0 {
		return ErrInvalidFinanceImport
	}
	for i := range snapshots {
		snapshots[i].UserID = userID
		if snapshots[i].Date.IsZero() {
			return ErrInvalidFinanceImport
		}
	}
	for i := range accounts {
		if accounts[i].Date.IsZero() {
			return ErrInvalidFinanceImport
		}
	}
	for i := range mortgages {
		if mortgages[i].Date.IsZero() {
			return ErrInvalidFinanceImport
		}
	}
	return s.repo.ImportBundle(ctx, workspaceID, snapshots, accounts, mortgages)
}

func (s *FinanceSnapshotService) ListSnapshots(ctx context.Context, userID, workspaceID string) ([]model.FinanceSnapshot, error) {
	return s.repo.ListSnapshots(ctx, workspaceID)
}

func (s *FinanceSnapshotService) ListAccounts(ctx context.Context, userID, workspaceID string, date *time.Time) ([]model.FinanceSnapshotAccount, error) {
	return s.repo.ListAccounts(ctx, workspaceID, date)
}

func (s *FinanceSnapshotService) ListMortgages(ctx context.Context, userID, workspaceID string) ([]model.FinanceMortgage, error) {
	return s.repo.ListMortgages(ctx, workspaceID)
}
