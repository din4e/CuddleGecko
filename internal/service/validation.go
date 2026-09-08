package service

import (
	"errors"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
)

// Sentinel validation errors so handlers can map them to 400 Bad Request
// instead of the generic 500 (any non-NotFound service error maps to 500).
var (
	ErrInvalidTransaction = errors.New("invalid transaction")
	ErrInvalidEvent       = errors.New("invalid event")
	ErrInvalidReminder    = errors.New("invalid reminder")
	ErrInvalidTodo        = errors.New("invalid todo")
)

// These validators live in the service layer (not the HTTP handler) so they
// apply to EVERY caller — the Gin handlers AND the MCP tools (which call the
// services directly and otherwise bypass the handler binding tags). The rules
// mirror the handler binding tags: a bad transaction type silently corrupts the
// Summary/Monthly aggregates (anything not "income" is counted as expense), a
// non-positive amount is nonsensical, and an event end before its start corrupts
// the calendar.

func validateTransactionForCreate(tx *model.Transaction) error {
	if tx.Type != "income" && tx.Type != "expense" {
		return fmt.Errorf("%w: type must be 'income' or 'expense'", ErrInvalidTransaction)
	}
	if tx.Amount <= 0 {
		return fmt.Errorf("%w: amount must be greater than 0", ErrInvalidTransaction)
	}
	return nil
}

// validateTransactionForUpdate applies the same rules only to fields that are
// set (non-zero), matching the handler's omitempty binding so a partial update
// that leaves type/amount unchanged isn't rejected.
func validateTransactionForUpdate(tx *model.Transaction) error {
	if tx.Type != "" && tx.Type != "income" && tx.Type != "expense" {
		return fmt.Errorf("%w: type must be 'income' or 'expense'", ErrInvalidTransaction)
	}
	if tx.Amount != 0 && tx.Amount <= 0 {
		return fmt.Errorf("%w: amount must be greater than 0", ErrInvalidTransaction)
	}
	return nil
}

// validateEvent checks that an explicit end time (if any) is after the start.
func validateEvent(event *model.Event) error {
	if event.EndTime != nil && event.EndTime.Before(event.StartTime) {
		return fmt.Errorf("%w: end time must be after start time", ErrInvalidEvent)
	}
	return nil
}

// validateReminderStatus checks status is a known value when set.
func validateReminderStatus(status model.ReminderStatus) error {
	switch status {
	case "", model.ReminderPending, model.ReminderDone, model.ReminderSnoozed:
		return nil
	default:
		return fmt.Errorf("%w: status must be 'pending', 'done', or 'snoozed'", ErrInvalidReminder)
	}
}

// validateTodoStatus checks a todo status is a known value. Empty means "leave
// unchanged" on create/update (the handler binding treats it as omitted), so it
// is accepted here; SetStatus rejects it separately.
func validateTodoStatus(status string) error {
	switch status {
	case "", "pending", "done", "abandoned":
		return nil
	default:
		return fmt.Errorf("%w: status must be 'pending', 'done', or 'abandoned'", ErrInvalidTodo)
	}
}

// validateTodoProgress checks the manual percent override is within 0-100 when
// set (nil means "not configured" and is always fine).
func validateTodoProgress(p *int) error {
	if p != nil && (*p < 0 || *p > 100) {
		return fmt.Errorf("%w: progress must be between 0 and 100", ErrInvalidTodo)
	}
	return nil
}

// validateTodoDuration checks the estimated-effort minutes are within 0..30d.
// 0 means "unset" and is always fine.
func validateTodoDuration(minutes int) error {
	if minutes < 0 || minutes > 30*24*60 {
		return fmt.Errorf("%w: duration must be between 0 and %d minutes", ErrInvalidTodo, 30*24*60)
	}
	return nil
}

// validTodoPriority reports whether p is one of the four rankable tiers
// (high / normal / low / none).
func validTodoPriority(p string) bool {
	return p == "high" || p == "normal" || p == "low" || p == "none"
}
