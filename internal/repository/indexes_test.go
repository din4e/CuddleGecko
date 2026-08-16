package repository

import (
	"strings"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestCompositeIndexesCreated verifies the GORM composite-index tags produce
// real indexes (with the intended column order) after AutoMigrate. These cover
// the hot list/stats paths that filter by workspace and order by a second/third
// column. AutoMigrate applies them idempotently to existing DBs on next start.
func TestCompositeIndexesCreated(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.Todo{}, &model.Workout{}, &model.Transaction{},
		&model.Interaction{}, &model.Reminder{}, &model.Event{}, &model.AIMessage{},
	))

	cases := []struct {
		table  string
		index  string
		columns string // expected column order, comma-separated as in CREATE INDEX
	}{
		{"todos", "idx_todo_ws_status_due", "workspace_id, status, due_time"},
		{"workouts", "idx_workout_ws_status_sched", "workspace_id, status, scheduled_at"},
		{"transactions", "idx_tx_ws_type_date", "workspace_id, type, date"},
		{"interactions", "idx_interaction_ws_contact_occurred", "workspace_id, contact_id, occurred_at"},
		{"reminders", "idx_reminder_ws_remind", "workspace_id, remind_at"},
		{"reminders", "idx_reminder_ws_status_remind", "workspace_id, status, remind_at"},
		{"reminders", "idx_reminder_ws_contact_remind", "workspace_id, contact_id, remind_at"},
		{"events", "idx_event_ws_start", "workspace_id, start_time"},
		{"ai_messages", "idx_aimessage_conv_created", "conversation_id, created_at"},
	}

	for _, c := range cases {
		var sql string
		err := db.Raw(
			"SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND name=?",
			c.table, c.index,
		).Scan(&sql).Error
		require.NoError(t, err, "query index %s on %s", c.index, c.table)
		assert.NotEmpty(t, sql, "composite index %s missing on %s", c.index, c.table)
		// Inspect only the column list (between the parens) so a column name
		// that also appears in the index name (e.g. "status" in
		// idx_todo_ws_status_due) doesn't false-match. Columns must be in order.
		start := strings.LastIndex(sql, "(")
		end := strings.LastIndex(sql, ")")
		require.Greater(t, start, -1, "no column list in index %s; sql=%s", c.index, sql)
		require.Greater(t, end, start, "malformed column list in index %s; sql=%s", c.index, sql)
		colList := sql[start:end]
		prev := -1
		for _, col := range strings.Split(c.columns, ", ") {
			idx := strings.Index(colList, col)
			require.GreaterOrEqual(t, idx, 0, "column %s not in index %s; sql=%s", col, c.index, sql)
			require.Greater(t, idx, prev, "column %s out of order in index %s; sql=%s", col, c.index, sql)
			prev = idx
		}
	}
}
