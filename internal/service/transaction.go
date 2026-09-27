package service

import (
	"context"
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTransactionNotFound = errors.New("transaction not found")

type TransactionRepository interface {
	Create(ctx context.Context, tx *model.Transaction) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Transaction, error)
	List(ctx context.Context, workspaceID uint, page, pageSize int, txType *string, contactID *uint, search string, from, to *time.Time) ([]model.Transaction, int64, error)
	ListByContactIDs(ctx context.Context, workspaceID uint, contactIDs []uint, limit int) ([]model.Transaction, error)
	Summary(ctx context.Context, workspaceID uint, from, to *time.Time) (income float64, expense float64, err error)
	Monthly(ctx context.Context, workspaceID uint, months int) ([]model.TransactionMonthly, error)
	Yearly(ctx context.Context, workspaceID uint) ([]model.TransactionYearly, error)
	CategoryTotals(ctx context.Context, workspaceID uint, from, to *time.Time) ([]model.TransactionCategoryTotal, error)
	Update(ctx context.Context, tx *model.Transaction) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type TransactionService struct {
	repo TransactionRepository
}

func NewTransactionService(repo TransactionRepository) *TransactionService {
	return &TransactionService{repo: repo}
}

func (s *TransactionService) Create(ctx context.Context, userID, workspaceID uint, tx *model.Transaction) (*model.Transaction, error) {
	tx.UserID = userID
	tx.WorkspaceID = workspaceID
	if err := validateTransactionForCreate(tx); err != nil {
		return nil, err
	}
	if err := s.repo.Create(ctx, tx); err != nil {
		return nil, err
	}
	return tx, nil
}

func (s *TransactionService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Transaction, error) {
	return s.repo.GetByID(ctx, workspaceID, id)
}

func (s *TransactionService) List(ctx context.Context, userID, workspaceID uint, page, pageSize int, txType *string, contactID *uint, search string, from, to *time.Time) ([]model.Transaction, int64, error) {
	return s.repo.List(ctx, workspaceID, page, pageSize, txType, contactID, search, from, to)
}

func (s *TransactionService) Summary(ctx context.Context, userID, workspaceID uint, from, to *time.Time) (income float64, expense float64, err error) {
	return s.repo.Summary(ctx, workspaceID, from, to)
}

func (s *TransactionService) Monthly(ctx context.Context, userID, workspaceID uint, months int) ([]model.TransactionMonthly, error) {
	return s.repo.Monthly(ctx, workspaceID, months)
}

func (s *TransactionService) Yearly(ctx context.Context, userID, workspaceID uint) ([]model.TransactionYearly, error) {
	return s.repo.Yearly(ctx, workspaceID)
}

func (s *TransactionService) CategoryTotals(ctx context.Context, userID, workspaceID uint, from, to *time.Time) ([]model.TransactionCategoryTotal, error) {
	return s.repo.CategoryTotals(ctx, workspaceID, from, to)
}

func (s *TransactionService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Transaction) (*model.Transaction, error) {
	if err := validateTransactionForUpdate(updates); err != nil {
		return nil, err
	}
	tx, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTransactionNotFound
	}

	if updates.Title != "" {
		tx.Title = updates.Title
	}
	if updates.Amount != 0 {
		tx.Amount = updates.Amount
	}
	if updates.Type != "" {
		tx.Type = updates.Type
	}
	tx.Category = updates.Category
	tx.ContactIDs = updates.ContactIDs
	if !updates.Date.IsZero() {
		tx.Date = updates.Date
	}
	tx.Notes = updates.Notes

	if err := s.repo.Update(ctx, tx); err != nil {
		return nil, err
	}
	return tx, nil
}

func (s *TransactionService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}
