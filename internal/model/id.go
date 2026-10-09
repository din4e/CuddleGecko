package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NewID mints a random UUID v4 — the primary key of every entity. Generated in
// a GORM BeforeCreate hook (below) so every creation path (handlers, MCP,
// exports, seeds) gets one without each call site remembering to assign it.
func NewID() string {
	return uuid.NewString()
}

// FillID assigns a fresh UUID when the primary key is still empty.
func FillID(id *string) {
	if *id == "" {
		*id = NewID()
	}
}

// ensureID is the shared shape of every model's BeforeCreate hook.
func ensureID(id *string, tx *gorm.DB) error {
	FillID(id)
	return nil
}
