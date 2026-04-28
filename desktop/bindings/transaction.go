package bindings

import (
	"context"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type TransactionBinding struct {
	svc *service.TransactionService
}

type TransactionSummaryResult struct {
	Income  float64 `json:"income"`
	Expense float64 `json:"expense"`
	Balance float64 `json:"balance"`
}

func (b *TransactionBinding) List(input ListTransactionsInput) (*PaginatedTransactions, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	var txType *string
	if input.Type != "" {
		txType = &input.Type
	}

	txs, total, err := b.svc.List(ctx, userID, workspaceID, input.Page, input.PageSize, txType, nil)
	if err != nil {
		return nil, err
	}

	return &PaginatedTransactions{
		Items:    txs,
		Total:    total,
		Page:     input.Page,
		PageSize: input.PageSize,
	}, nil
}

func (b *TransactionBinding) Summary() (*TransactionSummaryResult, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	income, expense, err := b.svc.Summary(ctx, userID, workspaceID)
	if err != nil {
		return nil, err
	}

	return &TransactionSummaryResult{
		Income:  income,
		Expense: expense,
		Balance: income - expense,
	}, nil
}

func (b *TransactionBinding) Create(input CreateTransactionInput) (*model.Transaction, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	date, _ := time.Parse(time.RFC3339, input.Date)

	tx := &model.Transaction{
		Title:      input.Title,
		Amount:     input.Amount,
		Type:       input.Type,
		Category:   input.Category,
		ContactIDs: input.ContactIDs,
		Date:       date,
		Notes:      input.Notes,
	}

	return b.svc.Create(ctx, userID, workspaceID, tx)
}

func (b *TransactionBinding) Update(id uint, input UpdateTransactionInput) (*model.Transaction, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	date, _ := time.Parse(time.RFC3339, input.Date)

	updates := &model.Transaction{
		Title:      input.Title,
		Amount:     input.Amount,
		Type:       input.Type,
		Category:   input.Category,
		ContactIDs: input.ContactIDs,
		Date:       date,
		Notes:      input.Notes,
	}

	return b.svc.Update(ctx, userID, workspaceID, id, updates)
}

func (b *TransactionBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, workspaceID, id)
}
