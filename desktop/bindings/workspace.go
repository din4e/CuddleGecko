package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type WorkspaceBinding struct {
	svc *service.WorkspaceService
}

func (b *WorkspaceBinding) List() ([]model.Workspace, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.List(ctx, userID)
}

func (b *WorkspaceBinding) Create(name, description, icon string) (*model.Workspace, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.Create(ctx, userID, name, description, icon)
}

func (b *WorkspaceBinding) Update(id uint, name, description, icon string) (*model.Workspace, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.Update(ctx, userID, id, name, description, icon)
}

func (b *WorkspaceBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, id)
}

func (b *WorkspaceBinding) Switch(id uint) (*model.Workspace, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	ws, err := b.svc.Switch(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	SetCurrentWorkspaceID(ws.ID)
	return ws, nil
}

func (b *WorkspaceBinding) GetDefault() (*model.Workspace, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.GetDefaultWorkspace(ctx, userID)
}
