package handler

import (
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
	Title     string  `json:"title" binding:"required"`
	Amount    float64 `json:"amount" binding:"required"`
	Type      string  `json:"type" binding:"required"`
	Category  string  `json:"category"`
	ContactIDs []uint `json:"contact_ids"`
	Date      string  `json:"date" binding:"required"`
	Notes     string  `json:"notes"`
}

type updateTransactionRequest struct {
	Title     string  `json:"title"`
	Amount    float64 `json:"amount"`
	Type      string  `json:"type"`
	Category  string  `json:"category"`
	ContactIDs []uint `json:"contact_ids"`
	Date      string  `json:"date"`
	Notes     string  `json:"notes"`
}

func (h *TransactionHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

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

	txs, total, err := h.svc.List(c.Request.Context(), userID, page, pageSize, txType, contactID)
	if err != nil {
		response.InternalError(c, "failed to list transactions")
		return
	}

	response.OKPaginated(c, txs, total, page, pageSize)
}

func (h *TransactionHandler) Summary(c *gin.Context) {
	userID := middleware.GetUserID(c)
	income, expense, err := h.svc.Summary(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to get summary")
		return
	}

	response.OK(c, gin.H{"income": income, "expense": expense, "balance": income - expense})
}

func (h *TransactionHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)

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
		Title:     req.Title,
		Amount:    req.Amount,
		Type:      req.Type,
		Category:  req.Category,
		ContactIDs: req.ContactIDs,
		Date:      date,
		Notes:     req.Notes,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, tx)
	if err != nil {
		response.InternalError(c, "failed to create transaction")
		return
	}

	response.Created(c, result)
}

func (h *TransactionHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
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
		Title:     req.Title,
		Amount:    req.Amount,
		Type:      req.Type,
		Category:  req.Category,
		ContactIDs: req.ContactIDs,
		Notes:     req.Notes,
	}

	if req.Date != "" {
		date, err := time.Parse(time.RFC3339, req.Date)
		if err != nil {
			response.BadRequest(c, "invalid date format")
			return
		}
		tx.Date = date
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), tx)
	if err != nil {
		if err == service.ErrTransactionNotFound {
			response.NotFound(c, "transaction not found")
			return
		}
		response.InternalError(c, "failed to update transaction")
		return
	}

	response.OK(c, result)
}

func (h *TransactionHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid transaction id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "transaction not found")
		return
	}

	response.OK(c, nil)
}
