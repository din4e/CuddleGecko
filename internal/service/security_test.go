package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// csvSafe must neutralize spreadsheet formula payloads but keep plain data
// (including negative numbers) untouched.
func TestCSVSafe_FormulaInjection(t *testing.T) {
	assert.Equal(t, "'=HYPERLINK(\"http://evil\",\"x\")", csvSafe("=HYPERLINK(\"http://evil\",\"x\")"))
	assert.Equal(t, "'@SUM(1,2)", csvSafe("@SUM(1,2)"))
	assert.Equal(t, "'+cmd|' /C calc", csvSafe("+cmd|' /C calc"))
	assert.Equal(t, "'-2+3|cmd", csvSafe("-2+3|cmd"), "leading '-' with non-numeric rest is a formula")
	assert.Equal(t, "'\t=WEBSERVICE", csvSafe("\t=WEBSERVICE"), "tab-prefixed formula")

	assert.Equal(t, "-12.50", csvSafe("-12.50"), "negative amount stays numeric")
	assert.Equal(t, "+1", csvSafe("+1"))
	assert.Equal(t, "normal title", csvSafe("normal title"))
	assert.Equal(t, "", csvSafe(""))
}

// HashRefreshToken must be stable and never equal the raw token — the stored
// form is what a DB-file leak would expose.
func TestHashRefreshToken_NotRawAtRest(t *testing.T) {
	raw := GenerateRefreshToken()
	h := HashRefreshToken(raw)
	assert.NotEqual(t, raw, h)
	assert.Equal(t, h, HashRefreshToken(raw), "hash is deterministic for lookups")
	assert.Len(t, h, 64, "sha256 hex")
	assert.NotEqual(t, h, HashRefreshToken(GenerateRefreshToken()))
}
