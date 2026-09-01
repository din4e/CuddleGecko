package service

import (
	"context"
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrRelationNotFound = errors.New("relation not found")

type RelationRepository interface {
	Create(ctx context.Context, relation *model.ContactRelation) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.ContactRelation, error)
	ListByContact(ctx context.Context, workspaceID, contactID uint) ([]model.ContactRelation, error)
	ListByContactIDs(ctx context.Context, workspaceID uint, contactIDs []uint) ([]model.ContactRelation, error)
	Delete(ctx context.Context, workspaceID, id uint) error
	GetAllByWorkspace(ctx context.Context, workspaceID uint) ([]model.ContactRelation, error)
}

type GraphNode struct {
	ID                 uint       `json:"id"`
	Name               string     `json:"name"`
	RelationshipLabels []string   `json:"relationship_labels"`
	AvatarEmoji        string     `json:"avatar_emoji"`
	AvatarURL          string     `json:"avatar_url"`
	LastInteractionAt  *time.Time `json:"last_interaction_at,omitempty"`
}

type GraphEdge struct {
	Source       uint       `json:"source"`
	Target       uint       `json:"target"`
	RelationType string     `json:"relation_type"`
	CreatedAt    *time.Time `json:"created_at,omitempty"`
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type RelationService struct {
	relationRepo    RelationRepository
	contactRepo     ContactRepository
	interactionRepo InteractionRepository
	notifier        ChangeNotifier
}

func NewRelationService(relationRepo RelationRepository, contactRepo ContactRepository, interactionRepo InteractionRepository, notifier ...ChangeNotifier) *RelationService {
	return &RelationService{relationRepo: relationRepo, contactRepo: contactRepo, interactionRepo: interactionRepo, notifier: firstNotifier(notifier)}
}

func (s *RelationService) Create(ctx context.Context, userID, workspaceID, contactIDA uint, relation *model.ContactRelation) (*model.ContactRelation, error) {
	relation.UserID = userID
	relation.WorkspaceID = workspaceID
	relation.ContactIDA = contactIDA
	if err := s.relationRepo.Create(ctx, relation); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceRelation, ChangeCreated, relation.ID, relation)
	return relation, nil
}

func (s *RelationService) ListByContact(ctx context.Context, userID, workspaceID, contactID uint) ([]model.ContactRelation, error) {
	return s.relationRepo.ListByContact(ctx, workspaceID, contactID)
}

func (s *RelationService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.relationRepo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourceRelation, ChangeDeleted, id, nil)
	return nil
}

func (s *RelationService) GetGraphData(ctx context.Context, userID, workspaceID uint) (*GraphData, error) {
	// Project only the columns the graph nodes need (no Tags Preload — that ran a
	// second query per request whose results were discarded).
	contacts, err := s.contactRepo.ListGraphContacts(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	relations, err := s.relationRepo.GetAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	// Per-contact last interaction time — powers the temporal coloring on the frontend.
	lastInt := map[uint]time.Time{}
	if s.interactionRepo != nil {
		if m, err := s.interactionRepo.LastByContact(ctx, workspaceID); err == nil {
			lastInt = m
		}
	}

	nodes := make([]GraphNode, len(contacts))
	for i, c := range contacts {
		n := GraphNode{
			ID:                 c.ID,
			Name:               c.Name,
			RelationshipLabels: c.RelationshipLabels,
			AvatarEmoji:        c.AvatarEmoji,
			AvatarURL:          c.AvatarURL,
		}
		if t, ok := lastInt[c.ID]; ok && !t.IsZero() {
			tt := t
			n.LastInteractionAt = &tt
		}
		nodes[i] = n
	}

	edges := make([]GraphEdge, len(relations))
	for i, r := range relations {
		e := GraphEdge{
			Source:       r.ContactIDA,
			Target:       r.ContactIDB,
			RelationType: r.RelationType,
		}
		if !r.CreatedAt.IsZero() {
			ct := r.CreatedAt
			e.CreatedAt = &ct
		}
		edges[i] = e
	}

	return &GraphData{Nodes: nodes, Edges: edges}, nil
}
