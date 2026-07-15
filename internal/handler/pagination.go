package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

const maxPageSize = 100

// parsePagination keeps list endpoints predictable and prevents an oversized
// page_size from turning a normal request into a large database scan.
func parsePagination(c *gin.Context, defaultPageSize int) (page, pageSize int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ = strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(defaultPageSize)))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	} else if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}
