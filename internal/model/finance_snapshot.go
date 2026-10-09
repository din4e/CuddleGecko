package model

import (
	"time"

	"gorm.io/gorm"
)

// FinanceSnapshot is one imported snapshot day's balance-sheet summary pushed
// from finance-web (assets/debt/net-worth), powering the net-worth trend card.
// One row per (workspace, date); re-pushing a date replaces it (upsert).
type FinanceSnapshot struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	UserID      string    `gorm:"size:36;index" json:"user_id"`
	WorkspaceID string    `gorm:"size:36;index;not null;default:0;uniqueIndex:idx_fin_snap_ws_date" json:"workspace_id"`
	Date        time.Time `gorm:"not null;uniqueIndex:idx_fin_snap_ws_date" json:"date"`
	Assets      float64   `gorm:"not null" json:"assets"`
	Debt        float64   `gorm:"not null" json:"debt"`
	NetWorth    float64   `gorm:"not null" json:"net_worth"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// FinanceSnapshotAccount is one account row on one snapshot day, carrying the
// exact GetSummary semantics from finance-web (credit-card `available` is
// already rewritten to −欠款 at push time). Deleted and re-inserted wholesale
// when a date is re-pushed.
type FinanceSnapshotAccount struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	WorkspaceID string    `gorm:"size:36;index;not null;default:0;index:idx_fin_acc_ws_date" json:"workspace_id"`
	Date        time.Time `gorm:"not null;index:idx_fin_acc_ws_date" json:"date"`
	Name        string    `gorm:"size:100" json:"name"`
	Amount      float64   `json:"amount"`
	Debt        float64   `json:"debt"`
	Available   float64   `json:"available"`
	Type        string    `gorm:"size:20" json:"type"`
	Note        string    `gorm:"size:200" json:"note"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// FinanceMortgage is one snapshot day's mortgage remaining principal and
// monthly payment, for the mortgage trend card.
type FinanceMortgage struct {
	ID          string    `gorm:"primaryKey;type:char(36)" json:"id"`
	WorkspaceID string    `gorm:"size:36;index;not null;default:0;uniqueIndex:idx_fin_mort_ws_date" json:"workspace_id"`
	Date        time.Time `gorm:"not null;uniqueIndex:idx_fin_mort_ws_date" json:"date"`
	Remaining   float64   `gorm:"not null" json:"remaining"`
	Monthly     float64   `gorm:"not null;default:0" json:"monthly"`
	Note        string    `gorm:"size:200" json:"note"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate assigns the UUID primary key on first insert.
func (f *FinanceSnapshot) BeforeCreate(tx *gorm.DB) error        { return ensureID(&f.ID, tx) }
func (f *FinanceSnapshotAccount) BeforeCreate(tx *gorm.DB) error { return ensureID(&f.ID, tx) }
func (f *FinanceMortgage) BeforeCreate(tx *gorm.DB) error        { return ensureID(&f.ID, tx) }
