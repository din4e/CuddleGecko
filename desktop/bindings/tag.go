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
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.List(ctx, userID)
}

func (b *TagBinding) Create(input CreateTagInput) (*model.Tag, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	tag := &model.Tag{Name: input.Name, Color: input.Color}
	return b.svc.Create(ctx, userID, tag)
}

func (b *TagBinding) Update(id uint, input UpdateTagInput) (*model.Tag, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	updates := &model.Tag{Name: input.Name, Color: input.Color}
	return b.svc.Update(ctx, userID, id, updates)
}

func (b *TagBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, id)
}
