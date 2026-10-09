package repository

import (
	"context"
	"encoding/json"
	"fmt"
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

func (r *TransactionRepo) GetByID(ctx context.Context, workspaceID, id string) (*model.Transaction, error) {
	var tx model.Transaction
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&tx).Error; err != nil {
		return nil, err
	}
	return &tx, nil
}

// applyDateRange adds the optional half-open [from, to) bounds to a query;
// nil bounds leave the query unfiltered (all-time), matching the pre-range API.
func applyDateRange(query *gorm.DB, from, to *time.Time) *gorm.DB {
	if from != nil {
		query = query.Where("date >= ?", *from)
	}
	if to != nil {
		query = query.Where("date < ?", *to)
	}
	return query
}

func (r *TransactionRepo) List(ctx context.Context, workspaceID string, page, pageSize int, txType *string, contactID *string, search string, tagIDs []string, from, to *time.Time) ([]model.Transaction, int64, error) {
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
			query = query.Where("JSON_CONTAINS(contact_ids, ?)", fmt.Sprintf("%q", *contactID))
		}
	}

	if search != "" {
		query = query.Where("LOWER(title) LIKE ?", "%"+strings.ToLower(search)+"%")
	}
	if len(tagIDs) > 0 {
		// EXISTS avoids duplicate transaction rows when multiple selected tags match.
		query = query.Where(
			"EXISTS (SELECT 1 FROM taggings WHERE taggings.workspace_id = ? AND taggings.target_type = ? AND taggings.target_id = transactions.id AND taggings.tag_id IN ?)",
			workspaceID, model.TagTargetTransaction, tagIDs,
		)
	}

	query = applyDateRange(query, from, to)

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

func (r *TransactionRepo) ListByContactIDs(ctx context.Context, workspaceID string, contactIDs []string, limit int) ([]model.Transaction, error) {
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

func (r *TransactionRepo) Summary(ctx context.Context, workspaceID string, from, to *time.Time) (income float64, expense float64, err error) {
	var result []struct {
		Type  string
		Total float64
	}

	query := r.db.WithContext(ctx).Model(&model.Transaction{}).
		Select("type, SUM(amount) as total").
		Where("workspace_id = ?", workspaceID)
	query = applyDateRange(query, from, to)
	err = query.Group("type").Find(&result).Error
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

// Monthly returns per-month income/expense totals via a single GROUP BY, so
// the dashboard trend chart and month tiles don't need to fetch every
// transaction. Two modes: with from/to (half-open [from, to), nil bound =
// unbounded) it aggregates the whole range — the finance page's year selector
// uses this; with both nil it falls back to the last `months` months
// (including the current month) for the rolling dashboard window.
func (r *TransactionRepo) Monthly(ctx context.Context, workspaceID string, months int, from, to *time.Time) ([]model.TransactionMonthly, error) {
	if months < 1 {
		months = 6
	}

	query := r.db.WithContext(ctx).Model(&model.Transaction{}).
		Where("workspace_id = ?", workspaceID)

	if from != nil || to != nil {
		query = applyDateRange(query, from, to)
	} else {
		now := time.Now()
		start := time.Date(now.Year(), now.Month()-time.Month(months-1), 1, 0, 0, 0, 0, now.Location())
		query = query.Where("date >= ?", start)
	}

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
	if err := query.
		Select(monthExpr + " AS month, " +
			"SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, " +
			"SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense").
		Group("month").
		Order("month ASC").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("transaction monthly: %w", err)
	}
	return rows, nil
}

// Yearly returns per-year income/expense totals for every year with data via a
// single GROUP BY. Like Monthly, the year bucket reads the stored date text
// (substr, not strftime) so a transaction stays in the year the user entered.
func (r *TransactionRepo) Yearly(ctx context.Context, workspaceID string) ([]model.TransactionYearly, error) {
	yearExpr := "substr(date, 1, 4)"
	if r.db.Dialector.Name() == "mysql" {
		yearExpr = "DATE_FORMAT(date, '%Y')"
	}

	var rows []model.TransactionYearly
	if err := r.db.WithContext(ctx).Model(&model.Transaction{}).
		Where("workspace_id = ?", workspaceID).
		Select(yearExpr + " AS year, " +
			"SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, " +
			"SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense").
		Group("year").
		Order("year ASC").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("transaction yearly: %w", err)
	}
	return rows, nil
}

// CategoryTotals returns per-category income/expense totals ("" = uncategorized)
// via a single GROUP BY, optionally bounded to the half-open [from, to) range.
func (r *TransactionRepo) CategoryTotals(ctx context.Context, workspaceID string, from, to *time.Time) ([]model.TransactionCategoryTotal, error) {
	query := r.db.WithContext(ctx).Model(&model.Transaction{}).
		Where("workspace_id = ?", workspaceID)
	query = applyDateRange(query, from, to)
	var rows []model.TransactionCategoryTotal
	if err := query.
		Select("category, " +
			"SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, " +
			"SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense").
		Group("category").
		Order("SUM(amount) DESC").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("transaction category totals: %w", err)
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

func (r *TransactionRepo) Delete(ctx context.Context, workspaceID, id string) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Transaction{}).Error; err != nil {
		return fmt.Errorf("delete transaction: %w", err)
	}
	return nil
}
