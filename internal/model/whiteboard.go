package model

import (
	"time"

	"gorm.io/gorm"
)

// Whitelisted WhiteboardNode ref types — the entity kinds a node can stand
// for. "note" (or "") means a free-text node with no entity behind it.
const (
	NodeRefContact     = "contact"
	NodeRefTodo        = "todo"
	NodeRefEvent       = "event"
	NodeRefWorkout     = "workout"
	NodeRefTransaction = "transaction"
	NodeRefNote        = "note"
)

// Whiteboard is a free-form infinite canvas. Nodes reference domain entities
// (contact/todo/event/workout/transaction) or hold free text; edges are
// user-drawn relationships between nodes. Node positions are canvas
// coordinates owned by the user — no auto layout server-side.
type Whiteboard struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	WorkspaceID uint           `gorm:"index;not null;default:0" json:"workspace_id"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// WhiteboardNode is one card on the canvas. Entity references carry the
// entity's name in Label (denormalized so the board renders without joins);
// free-text nodes use Label as title and Note as body.
type WhiteboardNode struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WhiteboardID uint          `gorm:"index:idx_wb_node_board;not null" json:"whiteboard_id"`
	RefType     string         `gorm:"size:20" json:"ref_type"` // ""|contact|todo|event|workout|transaction|note
	RefID       *uint          `json:"ref_id"`
	Label       string         `gorm:"size:300" json:"label"`
	Note        string         `gorm:"size:2000" json:"note"`
	X           float64        `gorm:"not null;default:0" json:"x"`
	Y           float64        `gorm:"not null;default:0" json:"y"`
	Color       string         `gorm:"size:20" json:"color"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// WhiteboardEdge is a user-drawn relationship between two nodes of the same
// board. Deleting either node cascades to its edges.
type WhiteboardEdge struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WhiteboardID uint          `gorm:"index:idx_wb_edge_board;not null" json:"whiteboard_id"`
	FromNodeID  uint           `gorm:"not null;index:idx_wb_edge_from" json:"from_node_id"`
	ToNodeID    uint           `gorm:"not null;index:idx_wb_edge_to" json:"to_node_id"`
	Label       string         `gorm:"size:200" json:"label"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// WhiteboardRelated is one candidate item returned by node expansion: a
// related entity the user can spawn onto the canvas as a linked node.
type WhiteboardRelated struct {
	RefType string `json:"ref_type"`
	RefID   uint   `json:"ref_id"`
	Label   string `json:"label"`
	Detail  string `json:"detail"`
}
