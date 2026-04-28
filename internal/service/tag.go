package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTagNotFound = errors.New("tag not found")

type TagRepository interface {
	Create(ctx context.Context, tag *model.Tag) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Tag, error)
	List(ctx context.Context, workspaceID uint) ([]model.Tag, error)
	Update(ctx context.Context, tag *model.Tag) error
	Delete(ctx context.Context, workspaceID, id uint) error
	GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Tag, error)
}

type TagService struct {
	repo TagRepository
}

func NewTagService(repo TagRepository) *TagService {
	return &TagService{repo: repo}
}

func (s *TagService) Create(ctx context.Context, userID, workspaceID uint, tag *model.Tag) (*model.Tag, error) {
	tag.UserID = userID
	tag.WorkspaceID = workspaceID
	if err := s.repo.Create(ctx, tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *TagService) List(ctx context.Context, userID, workspaceID uint) ([]model.Tag, error) {
	return s.repo.List(ctx, workspaceID)
}

func (s *TagService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Tag) (*model.Tag, error) {
	tag, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTagNotFound
	}
	if updates.Name != "" {
		tag.Name = updates.Name
	}
	tag.Color = updates.Color
	if err := s.repo.Update(ctx, tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *TagService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}
