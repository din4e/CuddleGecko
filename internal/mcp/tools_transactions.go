package mcp

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
)

func (s *MCPServer) registerTransactionTools() {
	s.registerTool("list_transactions", "List transactions with optional pagination and filtering.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"page":       map[string]interface{}{"type": "integer", "description": "Page number (default 1)", "default": 1},
			"page_size":  map[string]interface{}{"type": "integer", "description": "Items per page (default 20)", "default": 20},
			"type":       map[string]interface{}{"type": "string", "description": "Filter by type: income or expense"},
			"contact_id": map[string]interface{}{"type": "integer", "description": "Filter by contact ID"},
		},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		page := getArgInt(args, "page", 1)
		pageSize := getArgInt(args, "page_size", 20)
		var txType *string
		if v := getArg(args, "type"); v != nil {
			s := toString(v)
			txType = &s
		}
		var contactID *uint
		if v := getArg(args, "contact_id"); v != nil {
			u := toUint(v)
			contactID = &u
		}

		txs, total, err := s.transactionSvc.List(ctx, userID, workspaceID, page, pageSize, txType, contactID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"transactions": txs,
			"total":        total,
			"page":         page,
			"page_size":    pageSize,
		}, nil
	})

	s.registerTool("get_transaction_summary", "Get financial summary (total income and expense).", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		income, expense, err := s.transactionSvc.Summary(ctx, userID, workspaceID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"income":  income,
			"expense": expense,
			"balance": income - expense,
		}, nil
	})

	s.registerTool("create_transaction", "Create a new transaction.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title":       map[string]interface{}{"type": "string", "description": "Transaction title"},
			"amount":      map[string]interface{}{"type": "number", "description": "Transaction amount"},
			"type":        map[string]interface{}{"type": "string", "description": "Type: income or expense"},
			"category":    map[string]interface{}{"type": "string", "description": "Transaction category"},
			"contact_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"date":        map[string]interface{}{"type": "string", "description": "Transaction date (RFC3339)"},
			"notes":       map[string]interface{}{"type": "string", "description": "Additional notes"},
		},
		"required": []string{"title", "amount", "type", "date"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		tx := &model.Transaction{
			Title:      toString(getArg(args, "title")),
			Amount:     toFloat64(getArg(args, "amount")),
			Type:       toString(getArg(args, "type")),
			Category:   toString(getArg(args, "category")),
			ContactIDs: toUintSlice(getArg(args, "contact_ids")),
			Date:       toTime(getArg(args, "date")),
			Notes:      toString(getArg(args, "notes")),
		}
		return s.transactionSvc.Create(ctx, userID, workspaceID, tx)
	})

	s.registerTool("update_transaction", "Update an existing transaction.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":          map[string]interface{}{"type": "integer", "description": "Transaction ID"},
			"title":       map[string]interface{}{"type": "string", "description": "Transaction title"},
			"amount":      map[string]interface{}{"type": "number", "description": "Transaction amount"},
			"type":        map[string]interface{}{"type": "string", "description": "Type: income or expense"},
			"category":    map[string]interface{}{"type": "string", "description": "Transaction category"},
			"contact_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "integer"}, "description": "Related contact IDs"},
			"date":        map[string]interface{}{"type": "string", "description": "Transaction date (RFC3339)"},
			"notes":       map[string]interface{}{"type": "string", "description": "Additional notes"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		updates := &model.Transaction{
			Title:      toString(getArg(args, "title")),
			Amount:     toFloat64(getArg(args, "amount")),
			Type:       toString(getArg(args, "type")),
			Category:   toString(getArg(args, "category")),
			ContactIDs: toUintSlice(getArg(args, "contact_ids")),
			Date:       toTime(getArg(args, "date")),
			Notes:      toString(getArg(args, "notes")),
		}
		return s.transactionSvc.Update(ctx, userID, workspaceID, id, updates)
	})

	s.registerTool("delete_transaction", "Delete a transaction by ID.", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id": map[string]interface{}{"type": "integer", "description": "Transaction ID"},
		},
		"required": []string{"id"},
	}, func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error) {
		id := toUint(getArg(args, "id"))
		err := s.transactionSvc.Delete(ctx, userID, workspaceID, id)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "message": "transaction deleted"}, nil
	})
}
