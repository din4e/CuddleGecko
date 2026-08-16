package service

import (
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
)

// These validators run in the service layer so MCP (which calls services
// directly) can't bypass them. Verify the rules directly.
func TestValidationRules(t *testing.T) {
	// Transaction create — type must be income/expense; amount must be positive.
	assert.NoError(t, validateTransactionForCreate(&model.Transaction{Type: "income", Amount: 10}))
	assert.NoError(t, validateTransactionForCreate(&model.Transaction{Type: "expense", Amount: 0.01}))
	assert.Error(t, validateTransactionForCreate(&model.Transaction{Type: "bogus", Amount: 10}))
	assert.Error(t, validateTransactionForCreate(&model.Transaction{Type: "income", Amount: 0}))
	assert.Error(t, validateTransactionForCreate(&model.Transaction{Type: "income", Amount: -5}))

	// Transaction update — only set fields are checked (omitempty semantics).
	assert.NoError(t, validateTransactionForUpdate(&model.Transaction{})) // nothing set
	assert.Error(t, validateTransactionForUpdate(&model.Transaction{Type: "bogus"}))
	assert.Error(t, validateTransactionForUpdate(&model.Transaction{Amount: -5}))
	assert.NoError(t, validateTransactionForUpdate(&model.Transaction{Type: "income", Amount: 5}))

	// Event — an explicit end must be after the start.
	start := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	assert.NoError(t, validateEvent(&model.Event{StartTime: start})) // no end is fine
	before := start.Add(-time.Hour)
	assert.Error(t, validateEvent(&model.Event{StartTime: start, EndTime: &before}))
	after := start.Add(time.Hour)
	assert.NoError(t, validateEvent(&model.Event{StartTime: start, EndTime: &after}))

	// Reminder status must be a known value when set.
	assert.NoError(t, validateReminderStatus(""))
	assert.NoError(t, validateReminderStatus(model.ReminderPending))
	assert.NoError(t, validateReminderStatus(model.ReminderDone))
	assert.NoError(t, validateReminderStatus(model.ReminderSnoozed))
	assert.Error(t, validateReminderStatus("bogus"))
}
