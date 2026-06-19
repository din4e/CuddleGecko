package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/service"
)

type ExportBinding struct {
	svc *service.ExportService
}

func (b *ExportBinding) ExportJSON() (string, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return "", ErrNotAuthenticated
	}
	return b.svc.ExportJSON(ctx, workspaceID)
}

func (b *ExportBinding) ImportJSON(jsonData string) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.ImportJSON(ctx, userID, workspaceID, jsonData)
}
