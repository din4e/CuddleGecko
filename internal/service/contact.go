package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrContactNotFound = errors.New("contact not found")

// TaggingRepository is the polymorphic tag-association store shared by every
// taggable entity (contacts, todos, ...).
type TaggingRepository interface {
	SetTags(ctx context.Context, workspaceID uint, targetType string, targetID uint, tagIDs []uint) error
	GetTags(ctx context.Context, workspaceID uint, targetType string, targetID uint) ([]model.Tag, error)
	GetTagsByTargets(ctx context.Context, workspaceID uint, targetType string, targetIDs []uint) (map[uint][]model.Tag, error)
	FilterTargetIDs(ctx context.Context, workspaceID uint, targetType string, tagIDs []uint) ([]uint, error)
	RemoveAll(ctx context.Context, workspaceID uint, targetType string, targetID uint) error
}

type ContactRepository interface {
	Create(ctx context.Context, contact *model.Contact) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Contact, error)
	GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Contact, error)
	List(ctx context.Context, workspaceID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error)
	Update(ctx context.Context, contact *model.Contact) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type ContactService struct {
	repo       ContactRepository
	taggingRepo TaggingRepository
}

func NewContactService(repo ContactRepository, taggingRepo TaggingRepository) *ContactService {
	return &ContactService{repo: repo, taggingRepo: taggingRepo}
}

func (s *ContactService) Create(ctx context.Context, userID, workspaceID uint, contact *model.Contact) (*model.Contact, error) {
	contact.UserID = userID
	contact.WorkspaceID = workspaceID
	if err := s.repo.Create(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}
	s.populateTags(ctx, workspaceID, []*model.Contact{contact})
	return contact, nil
}

func (s *ContactService) List(ctx context.Context, userID, workspaceID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	contacts, total, err := s.repo.List(ctx, workspaceID, page, pageSize, search, tagIDs)
	if err != nil {
		return nil, 0, err
	}
	ptrs := make([]*model.Contact, len(contacts))
	for i := range contacts {
		ptrs[i] = &contacts[i]
	}
	s.populateTags(ctx, workspaceID, ptrs)
	return contacts, total, nil
}

func (s *ContactService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Contact) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, workspaceID, id)
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

func (s *ContactService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	// Clean up dangling tag associations.
	_ = s.taggingRepo.RemoveAll(ctx, workspaceID, model.TagTargetContact, id)
	return nil
}

func (s *ContactService) ReplaceTags(ctx context.Context, userID, workspaceID, contactID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, contactID); err != nil {
		return ErrContactNotFound
	}
	return s.taggingRepo.SetTags(ctx, workspaceID, model.TagTargetContact, contactID, tagIDs)
}

func (s *ContactService) GetTags(ctx context.Context, userID, workspaceID, contactID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, workspaceID, contactID); err != nil {
		return nil, ErrContactNotFound
	}
	return s.taggingRepo.GetTags(ctx, workspaceID, model.TagTargetContact, contactID)
}

// populateTags fills the virtual Tags field for a batch of contacts.
func (s *ContactService) populateTags(ctx context.Context, workspaceID uint, contacts []*model.Contact) {
	if s.taggingRepo == nil || len(contacts) == 0 {
		return
	}
	ids := make([]uint, len(contacts))
	for i, c := range contacts {
		ids[i] = c.ID
	}
	tagMap, err := s.taggingRepo.GetTagsByTargets(ctx, workspaceID, model.TagTargetContact, ids)
	if err != nil {
		return
	}
	for _, c := range contacts {
		if tags, ok := tagMap[c.ID]; ok {
			c.Tags = tags
		} else {
			c.Tags = []model.Tag{}
		}
	}
}
