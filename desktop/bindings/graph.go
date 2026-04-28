package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type GraphBinding struct {
	svc *service.RelationService
}

func (b *GraphBinding) GetGraph() (*service.GraphData, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.GetGraphData(ctx, userID, workspaceID)
}

func (b *GraphBinding) GetRelations(contactID uint) ([]model.ContactRelation, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	return b.svc.ListByContact(ctx, userID, workspaceID, contactID)
}

func (b *GraphBinding) CreateRelation(contactIDA uint, input CreateRelationInput) (*model.ContactRelation, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	relation := &model.ContactRelation{
		ContactIDB:   input.ContactIDB,
		RelationType: input.RelationType,
	}
	return b.svc.Create(ctx, userID, workspaceID, contactIDA, relation)
}

func (b *GraphBinding) DeleteRelation(id uint) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	workspaceID := GetCurrentWorkspaceID()
	if userID == 0 {
		return ErrNotAuthenticated
	}
	return b.svc.Delete(ctx, userID, workspaceID, id)
}
