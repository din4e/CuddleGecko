package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Regression: StaticPathCheck previously ran filepath.Clean on gin's wildcard
// param (which carries a leading slash), so IsAbs was true for EVERY request
// and avatars were 100% unservable (403 on all fetches). It must let real
// files through and still block traversal/absolute/outside-prefix paths.
func TestStaticPathCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Real temp avatar dir with a real file, mirroring the router wiring.
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.png"), []byte("png"), 0644))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "sub"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "sub", "b.png"), []byte("png"), 0644))

	r := gin.New()
	avatars := r.Group("/avatars")
	avatars.Use(StaticPathCheck())
	avatars.Static("/", dir)

	get := func(path string) int {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w.Code
	}

	// The bug: plain fetches must be servable.
	assert.Equal(t, http.StatusOK, get("/avatars/a.png"), "plain avatar fetch must work")
	assert.Equal(t, http.StatusOK, get("/avatars/sub/b.png"), "nested avatar fetch must work")

	// Traversal / absolute / outside-prefix paths must stay blocked. The plain
	// "../" form is path-normalized before routing (no /avatars match → 404);
	// the percent-encoded form decodes inside the wildcard → our 403. Both are
	// safe outcomes — what matters is the file is never served.
	assert.NotEqual(t, http.StatusOK, get("/avatars/../../etc/passwd"), "plain traversal must not serve")
	assert.Equal(t, http.StatusForbidden, get("/avatars/%2e%2e%2f%2e%2e%2fetc%2fpasswd"))
	assert.NotEqual(t, http.StatusOK, get("/avatars//etc/passwd"), "absolute-path form must not serve")
}
