package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type TagBinding struct {
	svc *service.TagService
}

func (b *TagBinding) List() ([]model.Tag, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	tags, _, err := b.svc.List(ctx, userID, workspaceID, 1, 200)
	return tags, err
}

func (b *TagBinding) Create(input CreateTagInput) (*model.Tag, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	tag := &model.Tag{Name: input.Name, Color: input.Color}
	return b.svc.Create(ctx, userID, workspaceID, tag)
}

func (b *TagBinding) Update(id uint, input UpdateTagInput) (*model.Tag, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	updates := &model.Tag{Name: input.Name, Color: input.Color}
	return b.svc.Update(ctx, userID, workspaceID, id, updates)
}

func (b *TagBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, workspaceID, id)
}
