package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type WorkspaceRepo struct {
	db *gorm.DB
}

func NewWorkspaceRepo(db *gorm.DB) *WorkspaceRepo {
	return &WorkspaceRepo{db: db}
}

func (r *WorkspaceRepo) Create(ctx context.Context, ws *model.Workspace) error {
	if err := r.db.WithContext(ctx).Create(ws).Error; err != nil {
		return fmt.Errorf("create workspace: %w", err)
	}
	return nil
}

func (r *WorkspaceRepo) GetByID(ctx context.Context, id uint) (*model.Workspace, error) {
	var ws model.Workspace
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&ws).Error
	if err != nil {
		return nil, err
	}
	return &ws, nil
}

func (r *WorkspaceRepo) ListByUserID(ctx context.Context, userID uint) ([]model.Workspace, error) {
	var workspaces []model.Workspace
	err := r.db.WithContext(ctx).
		Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ?", userID).
		Order("workspaces.created_at ASC").
		Find(&workspaces).Error
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	return workspaces, nil
}

func (r *WorkspaceRepo) Update(ctx context.Context, ws *model.Workspace) error {
	if err := r.db.WithContext(ctx).Save(ws).Error; err != nil {
		return fmt.Errorf("update workspace: %w", err)
	}
	return nil
}

func (r *WorkspaceRepo) Delete(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Delete(&model.Workspace{}, id).Error; err != nil {
		return fmt.Errorf("delete workspace: %w", err)
	}
	return nil
}

func (r *WorkspaceRepo) AddMember(ctx context.Context, member *model.WorkspaceMember) error {
	if err := r.db.WithContext(ctx).Create(member).Error; err != nil {
		return fmt.Errorf("add workspace member: %w", err)
	}
	return nil
}

func (r *WorkspaceRepo) RemoveMember(ctx context.Context, workspaceID, userID uint) error {
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&model.WorkspaceMember{}).Error; err != nil {
		return fmt.Errorf("remove workspace member: %w", err)
	}
	return nil
}

func (r *WorkspaceRepo) IsMember(ctx context.Context, workspaceID, userID uint) bool {
	var count int64
	r.db.WithContext(ctx).Model(&model.WorkspaceMember{}).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Count(&count)
	return count > 0
}

func (r *WorkspaceRepo) GetMemberRole(ctx context.Context, workspaceID, userID uint) (string, error) {
	var member model.WorkspaceMember
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		First(&member).Error
	if err != nil {
		return "", err
	}
	return member.Role, nil
}

func (r *WorkspaceRepo) GetDefaultWorkspace(ctx context.Context, userID uint) (*model.Workspace, error) {
	var ws model.Workspace
	err := r.db.WithContext(ctx).
		Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ? AND workspace_members.role = ?", userID, "owner").
		Order("workspaces.created_at ASC").
		First(&ws).Error
	if err != nil {
		return nil, err
	}
	return &ws, nil
}
