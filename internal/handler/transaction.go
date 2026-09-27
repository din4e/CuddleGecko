package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type TransactionHandler struct {
	svc *service.TransactionService
}

func NewTransactionHandler(svc *service.TransactionService) *TransactionHandler {
	return &TransactionHandler{svc: svc}
}

type createTransactionRequest struct {
	Title      string  `json:"title" binding:"required"`
	Amount     float64 `json:"amount" binding:"required,gt=0"`
	Type       string  `json:"type" binding:"required,oneof=income expense"`
	Category   string  `json:"category"`
	ContactIDs []uint  `json:"contact_ids"`
	Date       string  `json:"date" binding:"required"`
	Notes      string  `json:"notes"`
}

type updateTransactionRequest struct {
	Title      string  `json:"title"`
	Amount     float64 `json:"amount" binding:"omitempty,gt=0"`
	Type       string  `json:"type" binding:"omitempty,oneof=income expense"`
	Category   string  `json:"category"`
	ContactIDs []uint  `json:"contact_ids"`
	Date       string  `json:"date"`
	Notes      string  `json:"notes"`
}

// parseDateRange reads the optional ?from=&to= query params (YYYY-MM-DD,
// parsed as UTC to match the Jan-1 storage convention of imported annual rows)
// and returns half-open [from, to) bounds; nil = unbounded. `to` is the
// inclusive END DATE advanced one day so records stored later on the last day
// (different UTC instants) are still captured.
func parseDateRange(c *gin.Context) (from, to *time.Time, err error) {
	parse := func(name string) (*time.Time, error) {
		v := c.Query(name)
		if v == "" {
			return nil, nil
		}
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			return nil, err
		}
		return &t, nil
	}
	if from, err = parse("from"); err != nil {
		return nil, nil, err
	}
	if to, err = parse("to"); err != nil {
		return nil, nil, err
	}
	if to != nil {
		dayAfter := to.AddDate(0, 0, 1)
		to = &dayAfter
	}
	return from, to, nil
}

func (h *TransactionHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	page, pageSize := parsePagination(c, 20)

	var txType *string
	if v := c.Query("type"); v != "" {
		txType = &v
	}
	var contactID *uint
	if v := c.Query("contact_id"); v != "" {
		id, _ := strconv.ParseUint(v, 10, 32)
		uid := uint(id)
		contactID = &uid
	}

	search := c.Query("q")

	from, to, err := parseDateRange(c)
	if err != nil {
		response.BadRequest(c, "invalid from/to date format (expected YYYY-MM-DD)")
		return
	}

	txs, total, err := h.svc.List(c.Request.Context(), userID, workspaceID, page, pageSize, txType, contactID, search, parseTagIDs(c), from, to)
	if err != nil {
		response.InternalError(c, "failed to list transactions")
		return
	}

	response.OKPaginated(c, txs, total, page, pageSize)
}

func (h *TransactionHandler) GetTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid transaction id")
		return
	}

	tags, err := h.svc.GetTags(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		response.NotFound(c, "transaction not found")
		return
	}
	response.OK(c, tags)
}

func (h *TransactionHandler) ReplaceTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid transaction id")
		return
	}

	var req replaceTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReplaceTags(c.Request.Context(), userID, workspaceID, uint(id), req.TagIDs); err != nil {
		if errors.Is(err, model.ErrInvalidTagIDs) {
			response.BadRequest(c, err.Error())
			return
		}
		response.NotFound(c, "transaction not found")
		return
	}
	response.OK(c, nil)
}

func (h *TransactionHandler) Summary(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	from, to, err := parseDateRange(c)
	if err != nil {
		response.BadRequest(c, "invalid from/to date format (expected YYYY-MM-DD)")
		return
	}

	income, expense, err := h.svc.Summary(c.Request.Context(), userID, workspaceID, from, to)
	if err != nil {
		response.InternalError(c, "failed to get summary")
		return
	}

	response.OK(c, gin.H{"income": income, "expense": expense, "balance": income - expense})
}

func (h *TransactionHandler) Monthly(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	months, _ := strconv.Atoi(c.DefaultQuery("months", "6"))
	rows, err := h.svc.Monthly(c.Request.Context(), userID, workspaceID, months)
	if err != nil {
		response.InternalError(c, "failed to get monthly summary")
		return
	}

	response.OK(c, rows)
}

func (h *TransactionHandler) Yearly(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	rows, err := h.svc.Yearly(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to get yearly summary")
		return
	}

	response.OK(c, rows)
}

func (h *TransactionHandler) Categories(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	from, to, err := parseDateRange(c)
	if err != nil {
		response.BadRequest(c, "invalid from/to date format (expected YYYY-MM-DD)")
		return
	}

	rows, err := h.svc.CategoryTotals(c.Request.Context(), userID, workspaceID, from, to)
	if err != nil {
		response.InternalError(c, "failed to get category totals")
		return
	}

	response.OK(c, rows)
}

func (h *TransactionHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req createTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	date, err := time.Parse(time.RFC3339, req.Date)
	if err != nil {
		response.BadRequest(c, "invalid date format")
		return
	}

	tx := &model.Transaction{
		Title:      req.Title,
		Amount:     req.Amount,
		Type:       req.Type,
		Category:   req.Category,
		ContactIDs: req.ContactIDs,
		Date:       date,
		Notes:      req.Notes,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, tx)
	if err != nil {
		if errors.Is(err, service.ErrInvalidTransaction) {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to create transaction")
		return
	}

	response.Created(c, result)
}

func (h *TransactionHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid transaction id")
		return
	}

	var req updateTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	tx := &model.Transaction{
		Title:      req.Title,
		Amount:     req.Amount,
		Type:       req.Type,
		Category:   req.Category,
		ContactIDs: req.ContactIDs,
		Notes:      req.Notes,
	}

	if req.Date != "" {
		date, err := time.Parse(time.RFC3339, req.Date)
		if err != nil {
			response.BadRequest(c, "invalid date format")
			return
		}
		tx.Date = date
	}

	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), tx)
	if err != nil {
		if err == service.ErrTransactionNotFound {
			response.NotFound(c, "transaction not found")
			return
		}
		if errors.Is(err, service.ErrInvalidTransaction) {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to update transaction")
		return
	}

	response.OK(c, result)
}

func (h *TransactionHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid transaction id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "transaction not found")
		return
	}

	response.OK(c, nil)
}
