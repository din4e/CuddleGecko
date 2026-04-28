package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var (
	ErrWorkspaceNotFound = errors.New("workspace not found")
	ErrNotWorkspaceOwner = errors.New("only workspace owner can perform this action")
	ErrNotWorkspaceMember = errors.New("not a member of this workspace")
)

type WorkspaceRepository interface {
	Create(ctx context.Context, ws *model.Workspace) error
	GetByID(ctx context.Context, id uint) (*model.Workspace, error)
	ListByUserID(ctx context.Context, userID uint) ([]model.Workspace, error)
	Update(ctx context.Context, ws *model.Workspace) error
	Delete(ctx context.Context, id uint) error
	AddMember(ctx context.Context, member *model.WorkspaceMember) error
	RemoveMember(ctx context.Context, workspaceID, userID uint) error
	IsMember(ctx context.Context, workspaceID, userID uint) bool
	GetMemberRole(ctx context.Context, workspaceID, userID uint) (string, error)
	GetDefaultWorkspace(ctx context.Context, userID uint) (*model.Workspace, error)
}

type WorkspaceService struct {
	repo WorkspaceRepository
}

func NewWorkspaceService(repo WorkspaceRepository) *WorkspaceService {
	return &WorkspaceService{repo: repo}
}

func (s *WorkspaceService) Create(ctx context.Context, userID uint, name, description, icon string) (*model.Workspace, error) {
	ws := &model.Workspace{
		Name:        name,
		Description: description,
		Icon:        icon,
		OwnerID:     userID,
	}
	if err := s.repo.Create(ctx, ws); err != nil {
		return nil, err
	}

	member := &model.WorkspaceMember{
		WorkspaceID: ws.ID,
		UserID:      userID,
		Role:        "owner",
	}
	if err := s.repo.AddMember(ctx, member); err != nil {
		return nil, err
	}

	return ws, nil
}

func (s *WorkspaceService) List(ctx context.Context, userID uint) ([]model.Workspace, error) {
	return s.repo.ListByUserID(ctx, userID)
}

func (s *WorkspaceService) GetByID(ctx context.Context, userID, id uint) (*model.Workspace, error) {
	if !s.repo.IsMember(ctx, id, userID) {
		return nil, ErrNotWorkspaceMember
	}
	ws, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrWorkspaceNotFound
	}
	return ws, nil
}

func (s *WorkspaceService) Update(ctx context.Context, userID, id uint, name, description, icon string) (*model.Workspace, error) {
	ws, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrWorkspaceNotFound
	}
	if ws.OwnerID != userID {
		return nil, ErrNotWorkspaceOwner
	}

	if name != "" {
		ws.Name = name
	}
	ws.Description = description
	if icon != "" {
		ws.Icon = icon
	}

	if err := s.repo.Update(ctx, ws); err != nil {
		return nil, err
	}
	return ws, nil
}

func (s *WorkspaceService) Delete(ctx context.Context, userID, id uint) error {
	ws, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrWorkspaceNotFound
	}
	if ws.OwnerID != userID {
		return ErrNotWorkspaceOwner
	}
	return s.repo.Delete(ctx, id)
}

func (s *WorkspaceService) Switch(ctx context.Context, userID, workspaceID uint) (*model.Workspace, error) {
	if !s.repo.IsMember(ctx, workspaceID, userID) {
		return nil, ErrNotWorkspaceMember
	}
	ws, err := s.repo.GetByID(ctx, workspaceID)
	if err != nil {
		return nil, ErrWorkspaceNotFound
	}
	return ws, nil
}

func (s *WorkspaceService) CreateDefaultWorkspace(ctx context.Context, userID uint) (*model.Workspace, error) {
	return s.Create(ctx, userID, "默认空间", "", "🏠")
}

func (s *WorkspaceService) IsMember(ctx context.Context, workspaceID, userID uint) bool {
	return s.repo.IsMember(ctx, workspaceID, userID)
}

func (s *WorkspaceService) GetDefaultWorkspace(ctx context.Context, userID uint) (*model.Workspace, error) {
	return s.repo.GetDefaultWorkspace(ctx, userID)
}

func (s *WorkspaceService) GetDefaultWorkspaceID(ctx context.Context, userID uint) (uint, error) {
	ws, err := s.repo.GetDefaultWorkspace(ctx, userID)
	if err != nil {
		return 0, err
	}
	return ws.ID, nil
}
