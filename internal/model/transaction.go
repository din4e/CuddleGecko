package model

import (
	"time"

	"gorm.io/gorm"
)

type Transaction struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0;index:idx_transactions_workspace_date,priority:1;index:idx_transactions_workspace_type_date,priority:1" json:"workspace_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Amount      float64        `gorm:"not null" json:"amount"`
	Type        string         `gorm:"size:20;not null;index:idx_transactions_workspace_type_date,priority:2" json:"type"` // income / expense
	Category    string         `gorm:"size:50" json:"category"`
	ContactIDs  []uint         `gorm:"type:longtext;serializer:json" json:"contact_ids"`
	Date        time.Time      `gorm:"not null;index:idx_transactions_workspace_date,priority:2;index:idx_transactions_workspace_type_date,priority:3" json:"date"`
	Notes       string         `gorm:"type:longtext" json:"notes"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TransactionTrendPoint is an aggregated monthly amount used by the dashboard.
// Keeping this projection small avoids downloading a user's complete transaction
// history just to render a six-month chart.
type TransactionTrendPoint struct {
	Month  string  `json:"month"`
	Type   string  `json:"type"`
	Amount float64 `json:"amount"`
}
