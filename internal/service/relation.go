package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrRelationNotFound = errors.New("relation not found")

type RelationRepository interface {
	Create(ctx context.Context, relation *model.ContactRelation) error
	GetByID(ctx context.Context, userID, id uint) (*model.ContactRelation, error)
	ListByContact(ctx context.Context, userID, contactID uint) ([]model.ContactRelation, error)
	Delete(ctx context.Context, userID, id uint) error
	GetAllByUser(ctx context.Context, userID uint) ([]model.ContactRelation, error)
}

type GraphNode struct {
	ID                 uint     `json:"id"`
	Name               string   `json:"name"`
	RelationshipLabels []string `json:"relationship_labels"`
	AvatarEmoji        string   `json:"avatar_emoji"`
	AvatarURL          string   `json:"avatar_url"`
}

type GraphEdge struct {
	Source       uint   `json:"source"`
	Target       uint   `json:"target"`
	RelationType string `json:"relation_type"`
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type RelationService struct {
	relationRepo RelationRepository
	contactRepo  ContactRepository
}

func NewRelationService(relationRepo RelationRepository, contactRepo ContactRepository) *RelationService {
	return &RelationService{relationRepo: relationRepo, contactRepo: contactRepo}
}

func (s *RelationService) Create(ctx context.Context, userID, contactIDA uint, relation *model.ContactRelation) (*model.ContactRelation, error) {
	relation.UserID = userID
	relation.ContactIDA = contactIDA
	if err := s.relationRepo.Create(ctx, relation); err != nil {
		return nil, err
	}
	return relation, nil
}

func (s *RelationService) ListByContact(ctx context.Context, userID, contactID uint) ([]model.ContactRelation, error) {
	return s.relationRepo.ListByContact(ctx, userID, contactID)
}

func (s *RelationService) Delete(ctx context.Context, userID, id uint) error {
	return s.relationRepo.Delete(ctx, userID, id)
}

func (s *RelationService) GetGraphData(ctx context.Context, userID uint) (*GraphData, error) {
	contacts, _, err := s.contactRepo.List(ctx, userID, 1, 1000, "", nil)
	if err != nil {
		return nil, err
	}

	relations, err := s.relationRepo.GetAllByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	nodes := make([]GraphNode, len(contacts))
	for i, c := range contacts {
		nodes[i] = GraphNode{
			ID:                 c.ID,
			Name:               c.Name,
			RelationshipLabels: c.RelationshipLabels,
			AvatarEmoji:        c.AvatarEmoji,
			AvatarURL:          c.AvatarURL,
		}
	}

	edges := make([]GraphEdge, len(relations))
	for i, r := range relations {
		edges[i] = GraphEdge{
			Source:       r.ContactIDA,
			Target:       r.ContactIDB,
			RelationType: r.RelationType,
		}
	}

	return &GraphData{Nodes: nodes, Edges: edges}, nil
}
