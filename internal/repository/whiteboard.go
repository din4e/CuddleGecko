package repository

import (
	"context"
	"fmt"
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// WhiteboardRepo persists boards, their nodes and edges, and answers the
// cross-entity "related items" projection used by node expansion.
type WhiteboardRepo struct {
	db *gorm.DB
}

func NewWhiteboardRepo(db *gorm.DB) *WhiteboardRepo {
	return &WhiteboardRepo{db: db}
}

// --- Boards ---

func (r *WhiteboardRepo) CreateBoard(ctx context.Context, b *model.Whiteboard) error {
	if err := r.db.WithContext(ctx).Create(b).Error; err != nil {
		return fmt.Errorf("create whiteboard: %w", err)
	}
	return nil
}

func (r *WhiteboardRepo) GetBoard(ctx context.Context, workspaceID, id uint) (*model.Whiteboard, error) {
	var b model.Whiteboard
	if err := r.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&b).Error; err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *WhiteboardRepo) ListBoards(ctx context.Context, workspaceID uint) ([]model.Whiteboard, error) {
	var boards []model.Whiteboard
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).
		Order("updated_at DESC").Find(&boards).Error; err != nil {
		return nil, fmt.Errorf("list whiteboards: %w", err)
	}
	return boards, nil
}

func (r *WhiteboardRepo) UpdateBoard(ctx context.Context, b *model.Whiteboard) error {
	if err := r.db.WithContext(ctx).Model(&model.Whiteboard{ID: b.ID}).
		Select("name").Updates(b).Error; err != nil {
		return fmt.Errorf("update whiteboard: %w", err)
	}
	return nil
}

func (r *WhiteboardRepo) DeleteBoard(ctx context.Context, workspaceID, id uint) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&model.Whiteboard{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Where("whiteboard_id = ?", id).Delete(&model.WhiteboardNode{}).Error; err != nil {
			return err
		}
		return tx.Where("whiteboard_id = ?", id).Delete(&model.WhiteboardEdge{}).Error
	})
	if err != nil {
		return fmt.Errorf("delete whiteboard: %w", err)
	}
	return nil
}

// TouchBoard bumps updated_at so recently edited boards float to the top.
func (r *WhiteboardRepo) TouchBoard(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Model(&model.Whiteboard{ID: id}).
		UpdateColumn("updated_at", gorm.Expr("CURRENT_TIMESTAMP")).Error
}

// --- Nodes ---

func (r *WhiteboardRepo) ListNodes(ctx context.Context, boardID uint) ([]model.WhiteboardNode, error) {
	var nodes []model.WhiteboardNode
	if err := r.db.WithContext(ctx).Where("whiteboard_id = ?", boardID).
		Order("id ASC").Find(&nodes).Error; err != nil {
		return nil, fmt.Errorf("list whiteboard nodes: %w", err)
	}
	return nodes, nil
}

func (r *WhiteboardRepo) CreateNode(ctx context.Context, n *model.WhiteboardNode) error {
	if err := r.db.WithContext(ctx).Create(n).Error; err != nil {
		return fmt.Errorf("create whiteboard node: %w", err)
	}
	return nil
}

func (r *WhiteboardRepo) GetNode(ctx context.Context, boardID, id uint) (*model.WhiteboardNode, error) {
	var n model.WhiteboardNode
	if err := r.db.WithContext(ctx).Where("id = ? AND whiteboard_id = ?", id, boardID).First(&n).Error; err != nil {
		return nil, err
	}
	return &n, nil
}

func (r *WhiteboardRepo) UpdateNode(ctx context.Context, n *model.WhiteboardNode) error {
	if err := r.db.WithContext(ctx).Model(&model.WhiteboardNode{ID: n.ID}).
		Select("label", "note", "x", "y", "color").
		Updates(n).Error; err != nil {
		return fmt.Errorf("update whiteboard node: %w", err)
	}
	return nil
}

// DeleteNode removes the node and its edges in one transaction.
func (r *WhiteboardRepo) DeleteNode(ctx context.Context, boardID, id uint) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Where("id = ? AND whiteboard_id = ?", id, boardID).Delete(&model.WhiteboardNode{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return tx.Where("whiteboard_id = ? AND (from_node_id = ? OR to_node_id = ?)", boardID, id, id).
			Delete(&model.WhiteboardEdge{}).Error
	})
	if err != nil {
		return fmt.Errorf("delete whiteboard node: %w", err)
	}
	return nil
}

// --- Edges ---

func (r *WhiteboardRepo) ListEdges(ctx context.Context, boardID uint) ([]model.WhiteboardEdge, error) {
	var edges []model.WhiteboardEdge
	if err := r.db.WithContext(ctx).Where("whiteboard_id = ?", boardID).
		Order("id ASC").Find(&edges).Error; err != nil {
		return nil, fmt.Errorf("list whiteboard edges: %w", err)
	}
	return edges, nil
}

func (r *WhiteboardRepo) CreateEdge(ctx context.Context, e *model.WhiteboardEdge) error {
	if err := r.db.WithContext(ctx).Create(e).Error; err != nil {
		return fmt.Errorf("create whiteboard edge: %w", err)
	}
	return nil
}

func (r *WhiteboardRepo) DeleteEdge(ctx context.Context, boardID, id uint) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND whiteboard_id = ?", id, boardID).Delete(&model.WhiteboardEdge{})
	if res.Error != nil {
		return fmt.Errorf("delete whiteboard edge: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// --- Expansion projection ---

// Related returns candidate related entities for an entity reference — the
// server-side half of node expansion. Read-only cross-table queries, always
// workspace-scoped.
func (r *WhiteboardRepo) Related(ctx context.Context, workspaceID uint, refType string, refID uint) ([]model.WhiteboardRelated, error) {
	var out []model.WhiteboardRelated
	db := r.db.WithContext(ctx)

	// contactIDsJSON runs the array-containment predicate on a JSON column,
	// branching per driver (SQLite json_each / MySQL JSON_CONTAINS). Raw
	// table queries bypass GORM's soft-delete scope — filter deleted_at here.
	contactIDsJSON := func(table string) *gorm.DB {
		contains := ""
		args := []interface{}{workspaceID}
		switch db.Dialector.Name() {
		case "sqlite":
			contains = "EXISTS (SELECT 1 FROM json_each(contact_ids) WHERE value = ?)"
			args = append(args, refID)
		default:
			contains = "JSON_CONTAINS(contact_ids, ?)"
			args = append(args, strconv.FormatUint(uint64(refID), 10))
		}
		return db.Table(table).Where("workspace_id = ? AND deleted_at IS NULL AND "+contains, args...)
	}

	otherContact := func(a, b uint) uint {
		if a == refID {
			return b
		}
		return a
	}

	switch refType {
	case model.NodeRefContact:
		// relations in both directions
		var relations []model.ContactRelation
		if err := db.Where("workspace_id = ? AND (contact_id_a = ? OR contact_id_b = ?)", workspaceID, refID, refID).Find(&relations).Error; err != nil {
			return nil, err
		}
		for _, rel := range relations {
			id := otherContact(rel.ContactIDA, rel.ContactIDB)
			var c model.Contact
			if err := db.Where("id = ? AND workspace_id = ?", id, workspaceID).First(&c).Error; err != nil {
				continue // soft-deleted counterpart — skip
			}
			out = append(out, model.WhiteboardRelated{RefType: model.NodeRefContact, RefID: c.ID, Label: c.Name, Detail: rel.RelationType})
		}
		// todos / events referencing the contact
		var titles []struct{ ID uint; Title string }
		if err := contactIDsJSON("todos").Select("id, title").Where("status = ?", "pending").Limit(20).Scan(&titles).Error; err != nil {
			return nil, err
		}
		for _, t := range titles {
			out = append(out, model.WhiteboardRelated{RefType: model.NodeRefTodo, RefID: t.ID, Label: t.Title})
		}
		var events []struct{ ID uint; Title string }
		if err := contactIDsJSON("events").Select("id, title").Limit(20).Scan(&events).Error; err != nil {
			return nil, err
		}
		for _, e := range events {
			out = append(out, model.WhiteboardRelated{RefType: model.NodeRefEvent, RefID: e.ID, Label: e.Title})
		}
	case model.NodeRefTodo:
		var children []model.Todo
		if err := db.Where("workspace_id = ? AND parent_id = ?", workspaceID, refID).
			Order("sort_order ASC").Limit(50).Find(&children).Error; err != nil {
			return nil, err
		}
		for _, c := range children {
			out = append(out, model.WhiteboardRelated{RefType: model.NodeRefTodo, RefID: c.ID, Label: c.Title})
		}
	case model.NodeRefEvent:
		var ev model.Event
		if err := db.Where("id = ? AND workspace_id = ?", refID, workspaceID).First(&ev).Error; err == nil {
			var contacts []model.Contact
			if err := db.Where("workspace_id = ? AND id IN ?", workspaceID, ev.ContactIDs).Limit(20).Find(&contacts).Error; err != nil {
				return nil, err
			}
			for _, c := range contacts {
				out = append(out, model.WhiteboardRelated{RefType: model.NodeRefContact, RefID: c.ID, Label: c.Name})
			}
		}
	}
	return out, nil
}
