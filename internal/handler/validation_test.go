package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// bindRouter builds a tiny gin router that validates `req` into dst and returns
// 200/400 — enough to exercise gin's binding validators without the full
// auth/DB stack.
func bindRouter[T any](t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/x", func(c *gin.Context) {
		var dst T
		if err := c.ShouldBindJSON(&dst); err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
		c.Status(http.StatusOK)
	})
	return r
}

func postCode(t *testing.T, r *gin.Engine, body string) int {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body)))
	return w.Code
}

// The frontend already guards these; the server-side binding tags catch MCP,
// curl, or any other client that bypasses it. A typo'd type would otherwise be
// classified as expense in Summary/Monthly.
func TestTransactionCreateValidation(t *testing.T) {
	r := bindRouter[createTransactionRequest](t)
	assert.Equal(t, http.StatusOK, postCode(t, r, `{"title":"t","amount":10,"type":"income","date":"x"}`), "valid")
	assert.Equal(t, http.StatusBadRequest, postCode(t, r, `{"title":"t","amount":10,"type":"bogus","date":"x"}`), "bad type")
	assert.Equal(t, http.StatusBadRequest, postCode(t, r, `{"title":"t","amount":0,"type":"income","date":"x"}`), "zero amount")
	assert.Equal(t, http.StatusBadRequest, postCode(t, r, `{"title":"t","amount":-5,"type":"income","date":"x"}`), "negative amount")
}

func TestReminderUpdateStatusValidation(t *testing.T) {
	r := bindRouter[updateReminderRequest](t)
	assert.Equal(t, http.StatusOK, postCode(t, r, `{}`), "empty status (no change) ok")
	assert.Equal(t, http.StatusOK, postCode(t, r, `{"status":"pending"}`), "valid status")
	assert.Equal(t, http.StatusBadRequest, postCode(t, r, `{"status":"bogus"}`), "bad status")
}

// parseEventFromReq rejects an end time that isn't after the start time.
func TestParseEventFromReq_EndBeforeStart(t *testing.T) {
	start := "2026-01-02T10:00:00Z"
	_, err := parseEventFromReq(&createEventRequest{Title: "e", StartTime: start, EndTime: "2026-01-02T09:00:00Z"})
	assert.Error(t, err, "end before start should be rejected")

	_, err = parseEventFromReq(&createEventRequest{Title: "e", StartTime: start, EndTime: "2026-01-02T11:00:00Z"})
	assert.NoError(t, err, "end after start is fine")
}
