package mcp

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Regression: randomHex filled every byte with time.Now().UnixNano()%16, so a
// session ID's random suffix was typically a single repeated character and IDs
// collided under rapid generation. With crypto/rand, IDs must be unique and the
// suffix must actually vary.
func TestGenerateSessionID_UniqueAndVaried(t *testing.T) {
	const n = 2000
	seen := make(map[string]struct{}, n)
	suffixes := make([]string, 0, n)
	for i := 0; i < n; i++ {
		id := generateSessionID()
		_, dup := seen[id]
		assert.False(t, dup, "session IDs must be unique, got duplicate %q (i=%d)", id, i)
		seen[id] = struct{}{}
		parts := strings.SplitN(id, "-", 2)
		if len(parts) == 2 {
			suffixes = append(suffixes, parts[1])
		}
	}

	// The old impl almost always produced an all-one-char suffix (e.g. "aaaaaaaa");
	// a crypto-random suffix must vary.
	allSame := 0
	for _, s := range suffixes {
		first := s[0]
		same := true
		for i := 1; i < len(s); i++ {
			if s[i] != first {
				same = false
				break
			}
		}
		if same {
			allSame++
		}
	}
	assert.Equal(t, 0, allSame, "no session ID should have an all-identical random suffix")
}
