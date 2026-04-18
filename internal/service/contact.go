package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrContactNotFound = errors.New("contact not found")

type ContactRepository interface {
	Create(ctx context.Context, contact *model.Contact) error
	GetByID(ctx context.Context, userID, id uint) (*model.Contact, error)
	List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error)
	Update(ctx context.Context, contact *model.Contact) error
	Delete(ctx context.Context, userID, id uint) error
	ReplaceTags(ctx context.Context, contactID uint, tags []model.Tag) error
	GetTags(ctx context.Context, contactID uint) ([]model.Tag, error)
}

type ContactService struct {
	repo ContactRepository
}

func NewContactService(repo ContactRepository) *ContactService {
	return &ContactService{repo: repo}
}

func (s *ContactService) Create(ctx context.Context, userID uint, contact *model.Contact) (*model.Contact, error) {
	contact.UserID = userID
	if err := s.repo.Create(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) GetByID(ctx context.Context, userID, id uint) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}
	return contact, nil
}

func (s *ContactService) List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.List(ctx, userID, page, pageSize, search, tagIDs)
}

func (s *ContactService) Update(ctx context.Context, userID, id uint, updates *model.Contact) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}

	if updates.Name != "" {
		contact.Name = updates.Name
	}
	contact.Nickname = updates.Nickname
	contact.AvatarEmoji = updates.AvatarEmoji
	contact.AvatarURL = updates.AvatarURL
	contact.Phone = updates.Phone
	contact.Email = updates.Email
	contact.Birthday = updates.Birthday
	contact.Notes = updates.Notes
	if updates.RelationshipLabels != nil {
		contact.RelationshipLabels = updates.RelationshipLabels
	}

	if err := s.repo.Update(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}

func (s *ContactService) ReplaceTags(ctx context.Context, userID, contactID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, userID, contactID); err != nil {
		return ErrContactNotFound
	}
	tags := make([]model.Tag, len(tagIDs))
	for i, id := range tagIDs {
		tags[i].ID = id
	}
	return s.repo.ReplaceTags(ctx, contactID, tags)
}

func (s *ContactService) GetTags(ctx context.Context, userID, contactID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, userID, contactID); err != nil {
		return nil, ErrContactNotFound
	}
	return s.repo.GetTags(ctx, contactID)
}
