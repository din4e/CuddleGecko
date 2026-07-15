package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TransactionRepo struct {
	db     *gorm.DB
	driver string
}

func NewTransactionRepo(db *gorm.DB) *TransactionRepo {
	return &TransactionRepo{db: db, driver: db.Dialector.Name()}
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
		// ContactIDs is persisted as JSON, so filtering against a non-existent
		// contact_id column both fails and prevents linked transactions from
		// appearing in contact views.
		if r.driver == "sqlite" {
			query = query.Where("EXISTS (SELECT 1 FROM json_each(contact_ids) WHERE json_each.value = ?)", *contactID)
		} else {
			query = query.Where("JSON_CONTAINS(contact_ids, JSON_ARRAY(?))", *contactID)
		}
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

func (r *TransactionRepo) MonthlyTrend(ctx context.Context, workspaceID uint, since time.Time) ([]model.TransactionTrendPoint, error) {
	monthExpr := "strftime('%Y-%m', date)"
	if r.driver != "sqlite" {
		monthExpr = "DATE_FORMAT(date, '%Y-%m')"
	}

	var points []model.TransactionTrendPoint
	err := r.db.WithContext(ctx).Model(&model.Transaction{}).
		Select(monthExpr+" AS month, type, COALESCE(SUM(amount), 0) AS amount").
		Where("workspace_id = ? AND date >= ?", workspaceID, since).
		Group(monthExpr + ", type").
		Order("month ASC, type ASC").
		Scan(&points).Error
	if err != nil {
		return nil, fmt.Errorf("transaction monthly trend: %w", err)
	}
	return points, nil
}

func (r *TransactionRepo) ListByContactIDs(ctx context.Context, workspaceID uint, contactIDs []uint, limit int) ([]model.Transaction, error) {
	var txs []model.Transaction
	query := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("date DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&txs).Error; err != nil {
		return nil, fmt.Errorf("list transactions by contact ids: %w", err)
	}

	idSet := make(map[uint]struct{}, len(contactIDs))
	for _, id := range contactIDs {
		idSet[id] = struct{}{}
	}
	filtered := make([]model.Transaction, 0, len(txs))
	for _, tx := range txs {
		for _, cid := range tx.ContactIDs {
			if _, ok := idSet[cid]; ok {
				filtered = append(filtered, tx)
				break
			}
		}
	}
	return filtered, nil
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
	if err := r.db.WithContext(ctx).Model(&model.Transaction{ID: tx.ID}).
		Select("title", "amount", "type", "category", "contact_ids", "date", "notes").
		Updates(tx).Error; err != nil {
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
