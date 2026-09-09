package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTagNotFound = errors.New("tag not found")
var ErrInvalidTag = errors.New("invalid tag")

var tagColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validateTag(tag *model.Tag, requireName bool) error {
	if (requireName && tag.Name == "") || utf8.RuneCountInString(tag.Name) > 50 {
		return fmt.Errorf("%w: name must contain 1 to 50 characters", ErrInvalidTag)
	}
	if tag.Color != "" && !tagColorPattern.MatchString(tag.Color) {
		return fmt.Errorf("%w: color must be a six-digit hex color", ErrInvalidTag)
	}
	return nil
}

type TagRepository interface {
	Create(ctx context.Context, tag *model.Tag) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Tag, error)
	List(ctx context.Context, workspaceID uint, page, pageSize int, search ...string) ([]model.Tag, int64, error)
	Update(ctx context.Context, tag *model.Tag) error
	Delete(ctx context.Context, workspaceID, id uint) error
	GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Tag, error)
}

type TagService struct {
	repo     TagRepository
	notifier ChangeNotifier
}

func NewTagService(repo TagRepository, notifier ...ChangeNotifier) *TagService {
	return &TagService{repo: repo, notifier: firstNotifier(notifier)}
}

func (s *TagService) Create(ctx context.Context, userID, workspaceID uint, tag *model.Tag) (*model.Tag, error) {
	tag.Name = strings.TrimSpace(tag.Name)
	if err := validateTag(tag, true); err != nil {
		return nil, err
	}
	tag.UserID = userID
	tag.WorkspaceID = workspaceID
	if err := s.repo.Create(ctx, tag); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceTag, ChangeCreated, tag.ID, tag)
	return tag, nil
}

func (s *TagService) List(ctx context.Context, userID, workspaceID uint, page, pageSize int, search ...string) ([]model.Tag, int64, error) {
	return s.repo.List(ctx, workspaceID, page, pageSize, search...)
}

func (s *TagService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Tag) (*model.Tag, error) {
	requireName := updates.Name != ""
	updates.Name = strings.TrimSpace(updates.Name)
	if err := validateTag(updates, requireName); err != nil {
		return nil, err
	}
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
	notifyChange(ctx, s.notifier, workspaceID, ResourceTag, ChangeUpdated, tag.ID, tag)
	return tag, nil
}

func (s *TagService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceTag, ChangeDeleted, id, nil)
	return nil
}
