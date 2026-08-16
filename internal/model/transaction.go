package model

import (
	"time"

	"gorm.io/gorm"
)

type Transaction struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0;index:idx_tx_ws_type_date" json:"workspace_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Amount      float64        `gorm:"not null" json:"amount"`
	Type        string         `gorm:"size:20;not null;index:idx_tx_ws_type_date" json:"type"`   // income / expense
	Category    string         `gorm:"size:50" json:"category"`
	ContactIDs  []uint         `gorm:"type:longtext;serializer:json" json:"contact_ids"`
	Date        time.Time      `gorm:"not null;index:idx_tx_ws_type_date" json:"date"`
	Notes       string         `gorm:"type:longtext" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TransactionMonthly is one month's income/expense totals (keyed "YYYY-MM"),
// served by the dashboard's monthly aggregate so it doesn't have to fetch every
// transaction to sum them client-side.
type TransactionMonthly struct {
	Month   string  `json:"month"`
	Income  float64 `json:"income"`
	Expense float64 `json:"expense"`
}
