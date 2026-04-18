package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTransactionNotFound = errors.New("transaction not found")

type TransactionRepository interface {
	Create(ctx context.Context, tx *model.Transaction) error
	GetByID(ctx context.Context, userID, id uint) (*model.Transaction, error)
	List(ctx context.Context, userID uint, page, pageSize int, txType *string, contactID *uint) ([]model.Transaction, int64, error)
	Summary(ctx context.Context, userID uint) (income float64, expense float64, err error)
	Update(ctx context.Context, tx *model.Transaction) error
	Delete(ctx context.Context, userID, id uint) error
}

type TransactionService struct {
	repo TransactionRepository
}

func NewTransactionService(repo TransactionRepository) *TransactionService {
	return &TransactionService{repo: repo}
}

func (s *TransactionService) Create(ctx context.Context, userID uint, tx *model.Transaction) (*model.Transaction, error) {
	tx.UserID = userID
	if err := s.repo.Create(ctx, tx); err != nil {
		return nil, err
	}
	return tx, nil
}

func (s *TransactionService) GetByID(ctx context.Context, userID, id uint) (*model.Transaction, error) {
	return s.repo.GetByID(ctx, userID, id)
}

func (s *TransactionService) List(ctx context.Context, userID uint, page, pageSize int, txType *string, contactID *uint) ([]model.Transaction, int64, error) {
	return s.repo.List(ctx, userID, page, pageSize, txType, contactID)
}

func (s *TransactionService) Summary(ctx context.Context, userID uint) (income float64, expense float64, err error) {
	return s.repo.Summary(ctx, userID)
}

func (s *TransactionService) Update(ctx context.Context, userID, id uint, updates *model.Transaction) (*model.Transaction, error) {
	tx, err := s.repo.GetByID(ctx, userID, id)
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

func (s *TransactionService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}
