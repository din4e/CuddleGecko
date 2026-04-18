package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type ContactBinding struct {
	svc *service.ContactService
}

func (b *ContactBinding) List(input ListContactsInput) (*PaginatedContacts, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	contacts, total, err := b.svc.List(ctx, userID, input.Page, input.PageSize, input.Search, input.TagIDs)
	if err != nil {
		return nil, err
	}

	return &PaginatedContacts{
		Items:    contacts,
		Total:    total,
		Page:     input.Page,
		PageSize: input.PageSize,
	}, nil
}

func (b *ContactBinding) Create(input CreateContactInput) (*model.Contact, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	contact := &model.Contact{
		Name:               input.Name,
		Nickname:           input.Nickname,
		AvatarURL:          input.AvatarURL,
		Phone:              input.Phone,
		Email:              input.Email,
		Birthday:           input.Birthday,
		Notes:              input.Notes,
		RelationshipLabels: input.RelationshipLabels,
	}

	return b.svc.Create(ctx, userID, contact)
}

func (b *ContactBinding) GetByID(id uint) (*model.Contact, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.GetByID(ctx, userID, id)
}

func (b *ContactBinding) Update(id uint, input UpdateContactInput) (*model.Contact, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}

	updates := &model.Contact{
		Name:               input.Name,
		Nickname:           input.Nickname,
		AvatarURL:          input.AvatarURL,
		Phone:              input.Phone,
		Email:              input.Email,
		Birthday:           input.Birthday,
		Notes:              input.Notes,
		RelationshipLabels: input.RelationshipLabels,
	}

	return b.svc.Update(ctx, userID, id, updates)
}

func (b *ContactBinding) Delete(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, id)
}

func (b *ContactBinding) GetTags(contactID uint) ([]model.Tag, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.GetTags(ctx, userID, contactID)
}

func (b *ContactBinding) ReplaceTags(contactID uint, tagIDs []uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.ReplaceTags(ctx, userID, contactID, tagIDs)
}
