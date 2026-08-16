package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestClampPage(t *testing.T) {
	cases := []struct {
		page, pageSize, wantPage, wantPageSize int
	}{
		{0, 0, 1, 50},                  // zero → defaults
		{-1, -5, 1, 50},                // negative → defaults
		{2, 25, 2, 25},                 // valid passthrough
		{1, 100000, 1, 100000},         // boundary (max allowed) — export's value passes
		{1, 100001, 1, maxPageSize},    // just over → capped
		{3, 99999999, 3, maxPageSize},  // absurd request → capped (peak bound)
	}
	for _, c := range cases {
		p, ps := clampPage(c.page, c.pageSize)
		assert.Equal(t, c.wantPage, p, "page for in(%d, %d)", c.page, c.pageSize)
		assert.Equal(t, c.wantPageSize, ps, "pageSize for in(%d, %d)", c.page, c.pageSize)
	}
}
