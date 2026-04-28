package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TransactionRepo struct {
	db *gorm.DB
}

func NewTransactionRepo(db *gorm.DB) *TransactionRepo {
	return &TransactionRepo{db: db}
}

func (r *TransactionRepo) Create(ctx context.Context, tx *model.Transaction) error {
	if err := r.db.WithContext(ctx).Create(tx).Error; err != nil {
		return fmt.Errorf("create transaction: %w", err)
	}
	return nil
}

func (r *TransactionRepo) GetByID(ctx context.Context, workspaceID, id uint) (*model.Transaction, error) {
	var tx model.Transaction
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&tx).Error; err != nil {
		return nil, err
	}
	return &tx, nil
}

func (r *TransactionRepo) List(ctx context.Context, workspaceID uint, page, pageSize int, txType *string, contactID *uint) ([]model.Transaction, int64, error) {
	var txs []model.Transaction
	var total int64

	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)

	if txType != nil && *txType != "" {
		query = query.Where("type = ?", *txType)
	}
	if contactID != nil {
		query = query.Where("contact_id = ?", *contactID)
	}

	if err := query.Model(&model.Transaction{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count transactions: %w", err)
	}

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("date DESC").
		Find(&txs).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list transactions: %w", err)
	}

	return txs, total, nil
}

func (r *TransactionRepo) Summary(ctx context.Context, workspaceID uint) (income float64, expense float64, err error) {
	var result []struct {
		Type  string
		Total float64
	}

	err = r.db.WithContext(ctx).Model(&model.Transaction{}).
		Select("type, SUM(amount) as total").
		Where("workspace_id = ?", workspaceID).
		Group("type").
		Find(&result).Error
	if err != nil {
		return 0, 0, fmt.Errorf("transaction summary: %w", err)
	}

	for _, r := range result {
		if r.Type == "income" {
			income = r.Total
		} else {
			expense = r.Total
		}
	}
	return
}

func (r *TransactionRepo) Update(ctx context.Context, tx *model.Transaction) error {
	if err := r.db.WithContext(ctx).Save(tx).Error; err != nil {
		return fmt.Errorf("update transaction: %w", err)
	}
	return nil
}

func (r *TransactionRepo) Delete(ctx context.Context, workspaceID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Transaction{}).Error; err != nil {
		return fmt.Errorf("delete transaction: %w", err)
	}
	return nil
}
