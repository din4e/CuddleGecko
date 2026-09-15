package service

import (
	"context"
	"errors"
	"strings"

	"github.com/din4e/cuddlegecko/internal/model"
)

var (
	ErrWhiteboardNotFound = errors.New("whiteboard not found")
	ErrWhiteboardNodeNotFound = errors.New("whiteboard node not found")
	ErrWhiteboardEdgeNotFound = errors.New("whiteboard edge not found")
	ErrWhiteboardNameEmpty = errors.New("whiteboard name is empty")
	ErrWhiteboardBadRef    = errors.New("invalid node ref")
	ErrWhiteboardSelfEdge  = errors.New("edge endpoints must differ")
)

// WhiteboardRepository persists whiteboards and their nodes/edges.
type WhiteboardRepository interface {
	CreateBoard(ctx context.Context, b *model.Whiteboard) error
	GetBoard(ctx context.Context, workspaceID, id uint) (*model.Whiteboard, error)
	ListBoards(ctx context.Context, workspaceID uint) ([]model.Whiteboard, error)
	UpdateBoard(ctx context.Context, b *model.Whiteboard) error
	DeleteBoard(ctx context.Context, workspaceID, id uint) error
	TouchBoard(ctx context.Context, id uint) error

	ListNodes(ctx context.Context, boardID uint) ([]model.WhiteboardNode, error)
	CreateNode(ctx context.Context, n *model.WhiteboardNode) error
	GetNode(ctx context.Context, boardID, id uint) (*model.WhiteboardNode, error)
	UpdateNode(ctx context.Context, n *model.WhiteboardNode) error
	DeleteNode(ctx context.Context, boardID, id uint) error

	ListEdges(ctx context.Context, boardID uint) ([]model.WhiteboardEdge, error)
	CreateEdge(ctx context.Context, e *model.WhiteboardEdge) error
	DeleteEdge(ctx context.Context, boardID, id uint) error

	Related(ctx context.Context, workspaceID uint, refType string, refID uint) ([]model.WhiteboardRelated, error)
}

var validNodeRefTypes = map[string]bool{
	"": true, model.NodeRefNote: true,
	model.NodeRefContact: true, model.NodeRefTodo: true, model.NodeRefEvent: true,
	model.NodeRefWorkout: true, model.NodeRefTransaction: true,
}

type WhiteboardService struct {
	repo     WhiteboardRepository
	notifier ChangeNotifier
}

func NewWhiteboardService(repo WhiteboardRepository, notifier ...ChangeNotifier) *WhiteboardService {
	return &WhiteboardService{repo: repo, notifier: firstNotifier(notifier)}
}

// --- Boards ---

func (s *WhiteboardService) CreateBoard(ctx context.Context, userID, workspaceID uint, b *model.Whiteboard) (*model.Whiteboard, error) {
	b.Name = strings.TrimSpace(b.Name)
	if b.Name == "" {
		return nil, ErrWhiteboardNameEmpty
	}
	b.UserID = userID
	b.WorkspaceID = workspaceID
	if err := s.repo.CreateBoard(ctx, b); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, "whiteboard", ChangeCreated, b.ID, b)
	return b, nil
}

func (s *WhiteboardService) ListBoards(ctx context.Context, userID, workspaceID uint) ([]model.Whiteboard, error) {
	return s.repo.ListBoards(ctx, workspaceID)
}

func (s *WhiteboardService) RenameBoard(ctx context.Context, userID, workspaceID, id uint, name string) (*model.Whiteboard, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrWhiteboardNameEmpty
	}
	b, err := s.repo.GetBoard(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrWhiteboardNotFound
	}
	b.Name = name
	if err := s.repo.UpdateBoard(ctx, b); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, "whiteboard", ChangeUpdated, b.ID, b)
	return b, nil
}

func (s *WhiteboardService) DeleteBoard(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.DeleteBoard(ctx, workspaceID, id); err != nil {
		return ErrWhiteboardNotFound
	}
	notifyChange(ctx, s.notifier, workspaceID, "whiteboard", ChangeDeleted, id, nil)
	return nil
}

// Board returns the board plus its nodes and edges in one call — everything
// the canvas needs to render.
func (s *WhiteboardService) Board(ctx context.Context, userID, workspaceID, id uint) (*model.Whiteboard, []model.WhiteboardNode, []model.WhiteboardEdge, error) {
	b, err := s.repo.GetBoard(ctx, workspaceID, id)
	if err != nil {
		return nil, nil, nil, ErrWhiteboardNotFound
	}
	nodes, err := s.repo.ListNodes(ctx, id)
	if err != nil {
		return nil, nil, nil, err
	}
	edges, err := s.repo.ListEdges(ctx, id)
	if err != nil {
		return nil, nil, nil, err
	}
	return b, nodes, edges, nil
}

// --- Nodes ---

func (s *WhiteboardService) CreateNode(ctx context.Context, userID, workspaceID, boardID uint, n *model.WhiteboardNode) (*model.WhiteboardNode, error) {
	if err := s.ensureBoard(ctx, workspaceID, boardID); err != nil {
		return nil, err
	}
	if err := validateNode(n); err != nil {
		return nil, err
	}
	n.ID = 0
	n.WhiteboardID = boardID
	if err := s.repo.CreateNode(ctx, n); err != nil {
		return nil, err
	}
	_ = s.repo.TouchBoard(ctx, boardID)
	notifyChange(ctx, s.notifier, workspaceID, "whiteboard", ChangeUpdated, boardID, nil)
	return n, nil
}

func (s *WhiteboardService) UpdateNode(ctx context.Context, userID, workspaceID, boardID, nodeID uint, n *model.WhiteboardNode) (*model.WhiteboardNode, error) {
	existing, err := s.ensureNode(ctx, workspaceID, boardID, nodeID)
	if err != nil {
		return nil, err
	}
	if err := validateNode(n); err != nil {
		return nil, err
	}
	// Ref identity is immutable once created; only presentation moves.
	existing.Label = strings.TrimSpace(n.Label)
	existing.Note = n.Note
	existing.X = n.X
	existing.Y = n.Y
	existing.Color = n.Color
	if err := s.repo.UpdateNode(ctx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *WhiteboardService) DeleteNode(ctx context.Context, userID, workspaceID, boardID, nodeID uint) error {
	if _, err := s.ensureNode(ctx, workspaceID, boardID, nodeID); err != nil {
		return err
	}
	if err := s.repo.DeleteNode(ctx, boardID, nodeID); err != nil {
		return err
	}
	_ = s.repo.TouchBoard(ctx, boardID)
	notifyChange(ctx, s.notifier, workspaceID, "whiteboard", ChangeUpdated, boardID, nil)
	return nil
}

// --- Edges ---

func (s *WhiteboardService) CreateEdge(ctx context.Context, userID, workspaceID, boardID uint, e *model.WhiteboardEdge) (*model.WhiteboardEdge, error) {
	if err := s.ensureBoard(ctx, workspaceID, boardID); err != nil {
		return nil, err
	}
	if e.FromNodeID == e.ToNodeID {
		return nil, ErrWhiteboardSelfEdge
	}
	if _, err := s.ensureNode(ctx, workspaceID, boardID, e.FromNodeID); err != nil {
		return nil, err
	}
	if _, err := s.ensureNode(ctx, workspaceID, boardID, e.ToNodeID); err != nil {
		return nil, err
	}
	e.ID = 0
	e.WhiteboardID = boardID
	e.Label = strings.TrimSpace(e.Label)
	if err := s.repo.CreateEdge(ctx, e); err != nil {
		return nil, err
	}
	_ = s.repo.TouchBoard(ctx, boardID)
	notifyChange(ctx, s.notifier, workspaceID, "whiteboard", ChangeUpdated, boardID, nil)
	return e, nil
}

func (s *WhiteboardService) DeleteEdge(ctx context.Context, userID, workspaceID, boardID, edgeID uint) error {
	if err := s.repo.DeleteEdge(ctx, boardID, edgeID); err != nil {
		return ErrWhiteboardEdgeNotFound
	}
	_ = s.repo.TouchBoard(ctx, boardID)
	return nil
}

// --- Expansion ---

// Related lists the entities connected to a node's reference — candidates the
// canvas can spawn as linked nodes ("expand").
func (s *WhiteboardService) Related(ctx context.Context, userID, workspaceID, boardID, nodeID uint) ([]model.WhiteboardRelated, error) {
	n, err := s.ensureNode(ctx, workspaceID, boardID, nodeID)
	if err != nil {
		return nil, err
	}
	if n.RefID == nil || n.RefType == "" || n.RefType == model.NodeRefNote {
		return []model.WhiteboardRelated{}, nil
	}
	return s.repo.Related(ctx, workspaceID, n.RefType, *n.RefID)
}

// --- helpers ---

func (s *WhiteboardService) ensureBoard(ctx context.Context, workspaceID, boardID uint) error {
	_, err := s.repo.GetBoard(ctx, workspaceID, boardID)
	if err != nil {
		return ErrWhiteboardNotFound
	}
	return nil
}

func (s *WhiteboardService) ensureNode(ctx context.Context, workspaceID, boardID, nodeID uint) (*model.WhiteboardNode, error) {
	if err := s.ensureBoard(ctx, workspaceID, boardID); err != nil {
		return nil, err
	}
	n, err := s.repo.GetNode(ctx, boardID, nodeID)
	if err != nil {
		return nil, ErrWhiteboardNodeNotFound
	}
	return n, nil
}

// validateNode: entity refs must be typed + id'd; free nodes need a label.
func validateNode(n *model.WhiteboardNode) error {
	refType := strings.TrimSpace(n.RefType)
	n.RefType = refType
	if !validNodeRefTypes[refType] {
		return ErrWhiteboardBadRef
	}
	n.Label = strings.TrimSpace(n.Label)
	if refType != "" && refType != model.NodeRefNote {
		if n.RefID == nil || *n.RefID == 0 {
			return ErrWhiteboardBadRef
		}
	}
	if n.Label == "" && n.Note == "" && (refType == "" || refType == model.NodeRefNote) {
		return ErrWhiteboardNameEmpty
	}
	return nil
}
