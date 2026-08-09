package mcp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MCP args arrive from JSON unmarshaling, so numbers are float64 and arrays are
// []interface{} (not []uint/[]string). These tests pin the helper conversions
// every tool depends on.

func TestToUint(t *testing.T) {
	// JSON numbers unmarshal as float64.
	assert.Equal(t, uint(7), toUint(float64(7)))
	assert.Equal(t, uint(7), toUint(7))
	assert.Equal(t, uint(0), toUint("not a number"))
	assert.Equal(t, uint(0), toUint(nil))
}

func TestToFloat64(t *testing.T) {
	assert.Equal(t, 12.5, toFloat64(float64(12.5)))
	assert.Equal(t, 12.5, toFloat64(12.5))
	assert.Equal(t, float64(3), toFloat64(3))
}

func TestToBool(t *testing.T) {
	assert.True(t, toBool(true))
	assert.True(t, toBool("true"))
	assert.True(t, toBool("YES"))
	assert.True(t, toBool("1"))
	assert.True(t, toBool(1))
	assert.False(t, toBool("no"))
	assert.False(t, toBool(0))
	assert.False(t, toBool(nil))
}

func TestToString(t *testing.T) {
	assert.Equal(t, "hi", toString("hi"))
	assert.Equal(t, "", toString(nil))
	assert.Equal(t, "42", toString(42))
}

func TestToStringSlice_JSONArray(t *testing.T) {
	// JSON arrays arrive as []interface{}.
	got := toStringSlice([]interface{}{"a", "b", "c"})
	assert.Equal(t, []string{"a", "b", "c"}, got)
	assert.Nil(t, toStringSlice(nil))
	assert.Equal(t, []string{"x"}, toStringSlice([]string{"x"}))
}

func TestToUintSlice_JSONArray(t *testing.T) {
	// JSON arrays of numbers arrive as []interface{}{float64,...}.
	got := toUintSlice([]interface{}{float64(1), float64(2), float64(3)})
	assert.Equal(t, []uint{1, 2, 3}, got)
	assert.Nil(t, toUintSlice(nil))
}

func TestToTimePtr(t *testing.T) {
	want := time.Date(2026, 8, 1, 9, 30, 0, 0, time.UTC)
	got := toTimePtr("2026-08-01T09:30:00Z")
	requireTimePtr(t, want, got)

	assert.Nil(t, toTimePtr(nil))
	assert.Nil(t, toTimePtr(""))
	assert.Nil(t, toTimePtr("not a time"))
}

func TestToFloat64Ptr(t *testing.T) {
	f := toFloat64Ptr(float64(9.5))
	require.NotNil(t, f)
	assert.Equal(t, 9.5, *f)
	assert.Nil(t, toFloat64Ptr(nil))
}

func TestToUintPtr(t *testing.T) {
	u := toUintPtr(float64(5))
	require.NotNil(t, u)
	assert.Equal(t, uint(5), *u)
	assert.Nil(t, toUintPtr(nil))
}

func TestGetArgInt(t *testing.T) {
	args := map[string]interface{}{"page": float64(3)}
	assert.Equal(t, 3, getArgInt(args, "page", 1))
	assert.Equal(t, 1, getArgInt(args, "missing", 1), "missing key → default")
	assert.Equal(t, 1, getArgInt(nil, "page", 1))
}

// requireTimePtr compares a *time.Time to an expected instant.
func requireTimePtr(t *testing.T, want time.Time, got *time.Time) {
	t.Helper()
	if got == nil {
		t.Fatal("expected non-nil time pointer")
	}
	assert.True(t, want.Equal(*got), "got %v want %v", *got, want)
}

func requireNotNil(t *testing.T, p interface{}) {
	t.Helper()
	if p == nil {
		t.Fatal("expected non-nil")
	}
}
