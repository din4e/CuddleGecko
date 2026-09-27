package handler

import (
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type FinanceSnapshotHandler struct {
	svc *service.FinanceSnapshotService
}

func NewFinanceSnapshotHandler(svc *service.FinanceSnapshotService) *FinanceSnapshotHandler {
	return &FinanceSnapshotHandler{svc: svc}
}

type importFinanceRequest struct {
	Snapshots []struct {
		Date     string  `json:"date" binding:"required"`
		Assets   float64 `json:"assets"`
		Debt     float64 `json:"debt"`
		NetWorth float64 `json:"net_worth"`
	} `json:"snapshots"`
	Accounts []struct {
		Date      string  `json:"date" binding:"required"`
		Name      string  `json:"name" binding:"required"`
		Amount    float64 `json:"amount"`
		Debt      float64 `json:"debt"`
		Available float64 `json:"available"`
		Type      string  `json:"type"`
		Note      string  `json:"note"`
	} `json:"accounts"`
	Mortgage []struct {
		Date      string  `json:"date" binding:"required"`
		Remaining float64 `json:"remaining"`
		Monthly   float64 `json:"monthly"`
		Note      string  `json:"note"`
	} `json:"mortgage"`
}

// Import receives a finance-web bundle (net-worth snapshots + per-date
// account rows + mortgage trend). Dates are RFC3339; re-pushing the same
// dates replaces them, so the push tool stays idempotent.
func (h *FinanceSnapshotHandler) Import(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req importFinanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	parseDate := func(s string) (time.Time, bool) {
		t, err := time.Parse(time.RFC3339, s)
		return t, err == nil
	}

	snapshots := make([]model.FinanceSnapshot, 0, len(req.Snapshots))
	for _, s := range req.Snapshots {
		d, ok := parseDate(s.Date)
		if !ok {
			response.BadRequest(c, "invalid snapshot date (expected RFC3339): "+s.Date)
			return
		}
		snapshots = append(snapshots, model.FinanceSnapshot{Date: d, Assets: s.Assets, Debt: s.Debt, NetWorth: s.NetWorth})
	}
	accounts := make([]model.FinanceSnapshotAccount, 0, len(req.Accounts))
	for _, a := range req.Accounts {
		d, ok := parseDate(a.Date)
		if !ok {
			response.BadRequest(c, "invalid account date (expected RFC3339): "+a.Date)
			return
		}
		accounts = append(accounts, model.FinanceSnapshotAccount{Date: d, Name: a.Name, Amount: a.Amount, Debt: a.Debt, Available: a.Available, Type: a.Type, Note: a.Note})
	}
	mortgages := make([]model.FinanceMortgage, 0, len(req.Mortgage))
	for _, m := range req.Mortgage {
		d, ok := parseDate(m.Date)
		if !ok {
			response.BadRequest(c, "invalid mortgage date (expected RFC3339): "+m.Date)
			return
		}
		mortgages = append(mortgages, model.FinanceMortgage{Date: d, Remaining: m.Remaining, Monthly: m.Monthly, Note: m.Note})
	}

	if err := h.svc.Import(c.Request.Context(), userID, workspaceID, snapshots, accounts, mortgages); err != nil {
		if errors.Is(err, service.ErrInvalidFinanceImport) {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to import finance data")
		return
	}

	response.OK(c, gin.H{
		"snapshots": len(snapshots),
		"accounts":  len(accounts),
		"mortgage":  len(mortgages),
	})
}

// ListSnapshots returns the whole net-worth series (oldest first).
func (h *FinanceSnapshotHandler) ListSnapshots(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	rows, err := h.svc.ListSnapshots(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list snapshots")
		return
	}
	response.OK(c, rows)
}

// ListAccounts returns one snapshot day's account rows; ?date=YYYY-MM-DD
// picks the day (latest when omitted).
func (h *FinanceSnapshotHandler) ListAccounts(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var date *time.Time
	if v := c.Query("date"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			response.BadRequest(c, "invalid date format (expected YYYY-MM-DD)")
			return
		}
		date = &t
	}

	rows, err := h.svc.ListAccounts(c.Request.Context(), userID, workspaceID, date)
	if err != nil {
		response.InternalError(c, "failed to list snapshot accounts")
		return
	}
	response.OK(c, rows)
}

// ListMortgages returns the mortgage trend (oldest first).
func (h *FinanceSnapshotHandler) ListMortgages(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	rows, err := h.svc.ListMortgages(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list mortgages")
		return
	}
	response.OK(c, rows)
}
