package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newWhiteboardSvcTestDB(t *testing.T) (*WhiteboardService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Whiteboard{}, &model.WhiteboardNode{}, &model.WhiteboardEdge{},
		&model.Contact{}, &model.ContactRelation{}, &model.Todo{}, &model.Event{},
	))
	return NewWhiteboardService(repository.NewWhiteboardRepo(db)), db
}

func TestWhiteboardService_Flow(t *testing.T) {
	svc, _ := newWhiteboardSvcTestDB(t)
	ctx := context.Background()

	// board CRUD
	board, err := svc.CreateBoard(ctx, 1, 1, &model.Whiteboard{Name: "项目构思"})
	require.NoError(t, err)
	_, err = svc.CreateBoard(ctx, 1, 1, &model.Whiteboard{Name: "  "})
	assert.ErrorIs(t, err, ErrWhiteboardNameEmpty)
	_, err = svc.RenameBoard(ctx, 1, 1, board.ID, "新名字")
	require.NoError(t, err)

	// nodes: entity ref + free note
	contactID := uint(7)
	nodeA, err := svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{
		RefType: model.NodeRefContact, RefID: &contactID, Label: "小明", X: 100, Y: 50,
	})
	require.NoError(t, err)
	nodeB, err := svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{
		RefType: model.NodeRefNote, Label: "想法", Note: "周末约打球", X: 400, Y: 80,
	})
	require.NoError(t, err)

	// a ref node without an id is rejected
	_, err = svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{RefType: model.NodeRefContact, Label: "x"})
	assert.ErrorIs(t, err, ErrWhiteboardBadRef)
	// a free node with neither label nor note is rejected
	_, err = svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{RefType: model.NodeRefNote})
	assert.ErrorIs(t, err, ErrWhiteboardNameEmpty)

	// edges
	edge, err := svc.CreateEdge(ctx, 1, 1, board.ID, &model.WhiteboardEdge{
		FromNodeID: nodeA.ID, ToNodeID: nodeB.ID, Label: "认识",
	})
	require.NoError(t, err)
	_, err = svc.CreateEdge(ctx, 1, 1, board.ID, &model.WhiteboardEdge{FromNodeID: nodeA.ID, ToNodeID: nodeA.ID})
	assert.ErrorIs(t, err, ErrWhiteboardSelfEdge)

	// deleting an edge directly succeeds once, then reports not-found
	require.NoError(t, svc.DeleteEdge(ctx, 1, 1, board.ID, edge.ID))
	assert.ErrorIs(t, svc.DeleteEdge(ctx, 1, 1, board.ID, edge.ID), ErrWhiteboardEdgeNotFound)

	// a fresh edge is removed by cascade when its endpoint node is deleted
	edge2, err := svc.CreateEdge(ctx, 1, 1, board.ID, &model.WhiteboardEdge{FromNodeID: nodeA.ID, ToNodeID: nodeB.ID})
	require.NoError(t, err)
	_ = edge2

	// node position update (drag)
	nodeA.X, nodeA.Y = 250, 120
	updated, err := svc.UpdateNode(ctx, 1, 1, board.ID, nodeA.ID, nodeA)
	require.NoError(t, err)
	assert.Equal(t, 250.0, updated.X)

	// board payload carries nodes + edges
	_, nodes, edges, err := svc.Board(ctx, 1, 1, board.ID)
	require.NoError(t, err)
	assert.Len(t, nodes, 2)
	assert.Len(t, edges, 1)

	// deleting a node cascades its edges
	require.NoError(t, svc.DeleteNode(ctx, 1, 1, board.ID, nodeB.ID))
	_, _, edges, err = svc.Board(ctx, 1, 1, board.ID)
	require.NoError(t, err)
	assert.Len(t, edges, 0)

	// unknown ids are scoped errors
	assert.ErrorIs(t, svc.DeleteBoard(ctx, 1, 99, 999), ErrWhiteboardNotFound)
}

func TestWhiteboardService_Expand(t *testing.T) {
	svc, db := newWhiteboardSvcTestDB(t)
	ctx := context.Background()
	board, err := svc.CreateBoard(ctx, 1, 1, &model.Whiteboard{Name: "展开"})
	require.NoError(t, err)

	contactID := uint(7)
	node, err := svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{
		RefType: model.NodeRefContact, RefID: &contactID, Label: "小明",
	})
	require.NoError(t, err)
	noteNode, err := svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{RefType: model.NodeRefNote, Label: "便签"})
	require.NoError(t, err)

	// free-text nodes expand to nothing
	empty, err := svc.Related(ctx, 1, 1, board.ID, noteNode.ID)
	require.NoError(t, err)
	assert.Empty(t, empty)

	// related data: another contact via a relation, a pending todo and an
	// event that both reference the contact through contact_ids
	hong := model.Contact{UserID: 1, WorkspaceID: 1, Name: "小红"}
	require.NoError(t, db.Create(&hong).Error)
	require.NoError(t, db.Create(&model.ContactRelation{UserID: 1, WorkspaceID: 1, ContactIDA: contactID, ContactIDB: hong.ID, RelationType: "同事"}).Error)
	require.NoError(t, db.Create(&model.Todo{UserID: 1, WorkspaceID: 1, Title: "约咖啡", ContactIDs: []uint{contactID}}).Error)
	require.NoError(t, db.Create(&model.Event{UserID: 1, WorkspaceID: 1, Title: "生日会", ContactIDs: []uint{contactID}}).Error)

	items, err := svc.Related(ctx, 1, 1, board.ID, node.ID)
	require.NoError(t, err)
	byType := map[string][]model.WhiteboardRelated{}
	for _, it := range items {
		byType[it.RefType] = append(byType[it.RefType], it)
	}
	require.Len(t, byType[model.NodeRefContact], 1)
	assert.Equal(t, "小红", byType[model.NodeRefContact][0].Label)
	assert.Equal(t, "同事", byType[model.NodeRefContact][0].Detail)
	require.Len(t, byType[model.NodeRefTodo], 1)
	assert.Equal(t, "约咖啡", byType[model.NodeRefTodo][0].Label)
	require.Len(t, byType[model.NodeRefEvent], 1)
	assert.Equal(t, "生日会", byType[model.NodeRefEvent][0].Label)

	// todo expansion: children appear, other todos don't
	parent, err := svc.CreateNode(ctx, 1, 1, board.ID, &model.WhiteboardNode{
		RefType: model.NodeRefTodo, RefID: ptrUint(1), Label: "约咖啡",
	})
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.Todo{UserID: 1, WorkspaceID: 1, Title: "子任务", ParentID: ptrUint(1)}).Error)
	items, err = svc.Related(ctx, 1, 1, board.ID, parent.ID)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "子任务", items[0].Label)
}

func ptrUint(v uint) *uint { return &v }
