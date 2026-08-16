package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

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

func (r *TransactionRepo) List(ctx context.Context, workspaceID uint, page, pageSize int, txType *string, contactID *uint, search string) ([]model.Transaction, int64, error) {
	var txs []model.Transaction
	var total int64

	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)

	if txType != nil && *txType != "" {
		query = query.Where("type = ?", *txType)
	}
	if contactID != nil {
		// contact_ids is a JSON-serialized column ([]uint); there is no scalar
		// contact_id column, so filter with an array-containment predicate:
		// SQLite exposes array elements via json_each, MySQL via JSON_CONTAINS.
		switch r.db.Dialector.Name() {
		case "sqlite":
			query = query.Where("EXISTS (SELECT 1 FROM json_each(contact_ids) WHERE value = ?)", *contactID)
		default:
			query = query.Where("JSON_CONTAINS(contact_ids, ?)", strconv.FormatUint(uint64(*contactID), 10))
		}
	}

	if search != "" {
		query = query.Where("LOWER(title) LIKE ?", "%"+strings.ToLower(search)+"%")
	}

	if err := query.Model(&model.Transaction{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count transactions: %w", err)
	}

	page, pageSize = clampPage(page, pageSize)
	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("date DESC").
		Find(&txs).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list transactions: %w", err)
	}

	return txs, total, nil
}

func (r *TransactionRepo) ListByContactIDs(ctx context.Context, workspaceID uint, contactIDs []uint, limit int) ([]model.Transaction, error) {
	if len(contactIDs) == 0 {
		return nil, nil
	}
	query := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	// Filter in SQL (not in Go after a LIMIT) so the result isn't a biased sample
	// of the workspace's most-recent transactions. contact_ids is a JSON array;
	// match any transaction whose set overlaps the requested contactIDs.
	switch r.db.Dialector.Name() {
	case "sqlite":
		query = query.Where("EXISTS (SELECT 1 FROM json_each(contact_ids) WHERE value IN ?)", contactIDs)
	default: // MySQL — JSON_OVERLAPS against the requested-id set.
		arr, _ := json.Marshal(contactIDs)
		query = query.Where("JSON_OVERLAPS(contact_ids, ?)", arr)
	}
	query = query.Order("date DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	var txs []model.Transaction
	if err := query.Find(&txs).Error; err != nil {
		return nil, fmt.Errorf("list transactions by contact ids: %w", err)
	}
	return txs, nil
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

// Monthly returns per-month income/expense totals for the last `months` months
// (including the current month) via a single GROUP BY, so the dashboard trend
// chart and month tiles don't need to fetch every transaction.
func (r *TransactionRepo) Monthly(ctx context.Context, workspaceID uint, months int) ([]model.TransactionMonthly, error) {
	if months < 1 {
		months = 6
	}
	now := time.Now()
	start := time.Date(now.Year(), now.Month()-time.Month(months-1), 1, 0, 0, 0, 0, now.Location())

	// Month truncation differs by driver: SQLite substr vs MySQL DATE_FORMAT.
	// NB: strftime('%Y-%m', date) would CONVERT the stored timestamp to UTC
	// before formatting, so a transaction dated 2026-08-01 00:30+08:00 would
	// bucket into 2026-07. substr takes the literal "YYYY-MM" from the stored
	// text instead, bucketing by the wall-clock month the user entered.
	monthExpr := "substr(date, 1, 7)"
	if r.db.Dialector.Name() == "mysql" {
		monthExpr = "DATE_FORMAT(date, '%Y-%m')"
	}

	var rows []model.TransactionMonthly
	if err := r.db.WithContext(ctx).Model(&model.Transaction{}).
		Where("workspace_id = ? AND date >= ?", workspaceID, start).
		Select(monthExpr+" AS month, "+
			"SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, "+
			"SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense").
		Group("month").
		Order("month ASC").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("transaction monthly: %w", err)
	}
	return rows, nil
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
