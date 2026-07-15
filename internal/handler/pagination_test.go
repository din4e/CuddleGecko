package handler

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestParsePagination(t *testing.T) {
	tests := []struct {
		name               string
		query              string
		defaultSize        int
		wantPage, wantSize int
	}{
		{"defaults", "", 20, 1, 20},
		{"valid values", "?page=3&page_size=75", 20, 3, 75},
		{"invalid values", "?page=0&page_size=-1", 50, 1, 50},
		{"caps page size", "?page=2&page_size=999", 20, 2, maxPageSize},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("GET", "/"+tt.query, nil)
			page, size := parsePagination(c, tt.defaultSize)
			assert.Equal(t, tt.wantPage, page)
			assert.Equal(t, tt.wantSize, size)
		})
	}
}
