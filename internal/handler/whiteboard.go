package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type WhiteboardHandler struct {
	svc *service.WhiteboardService
}

func NewWhiteboardHandler(svc *service.WhiteboardService) *WhiteboardHandler {
	return &WhiteboardHandler{svc: svc}
}

type whiteboardRequest struct {
	Name string `json:"name"`
}

type boardResponse struct {
	model.Whiteboard
	Nodes []model.WhiteboardNode `json:"nodes"`
	Edges []model.WhiteboardEdge `json:"edges"`
}

func (h *WhiteboardHandler) CreateBoard(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req whiteboardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	b, err := h.svc.CreateBoard(c.Request.Context(), userID, workspaceID, &model.Whiteboard{Name: req.Name})
	if err != nil {
		if err == service.ErrWhiteboardNameEmpty {
			response.BadRequest(c, "name is required")
			return
		}
		response.InternalError(c, "failed to create whiteboard")
		return
	}
	response.Created(c, b)
}

func (h *WhiteboardHandler) ListBoards(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boards, err := h.svc.ListBoards(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list whiteboards")
		return
	}
	response.OK(c, boards)
}

// GetBoard returns the board with its nodes and edges in one payload.
func (h *WhiteboardHandler) GetBoard(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	b, nodes, edges, err := h.svc.Board(c.Request.Context(), userID, workspaceID, id)
	if err != nil {
		response.NotFound(c, "whiteboard not found")
		return
	}
	response.OK(c, boardResponse{Whiteboard: *b, Nodes: nodes, Edges: edges})
}

func (h *WhiteboardHandler) RenameBoard(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req whiteboardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	b, err := h.svc.RenameBoard(c.Request.Context(), userID, workspaceID, id, req.Name)
	if err != nil {
		if err == service.ErrWhiteboardNameEmpty {
			response.BadRequest(c, "name is required")
			return
		}
		response.NotFound(c, "whiteboard not found")
		return
	}
	response.OK(c, b)
}

func (h *WhiteboardHandler) DeleteBoard(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := h.svc.DeleteBoard(c.Request.Context(), userID, workspaceID, id); err != nil {
		response.NotFound(c, "whiteboard not found")
		return
	}
	response.OK(c, nil)
}

type wbNodeRequest struct {
	RefType string   `json:"ref_type"`
	RefID   *uint    `json:"ref_id"`
	Label   string   `json:"label"`
	Note    string   `json:"note"`
	X       *float64 `json:"x"`
	Y       *float64 `json:"y"`
	Color   string   `json:"color"`
}

func (r wbNodeRequest) toModel(id uint) *model.WhiteboardNode {
	n := &model.WhiteboardNode{
		ID:          id,
		RefType:     r.RefType,
		RefID:       r.RefID,
		Label:       r.Label,
		Note:        r.Note,
		Color:       r.Color,
	}
	if r.X != nil {
		n.X = *r.X
	}
	if r.Y != nil {
		n.Y = *r.Y
	}
	return n
}

func (h *WhiteboardHandler) CreateNode(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boardID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req wbNodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	n, err := h.svc.CreateNode(c.Request.Context(), userID, workspaceID, boardID, req.toModel(0))
	if err != nil {
		mapWhiteboardError(c, err)
		return
	}
	response.Created(c, n)
}

func (h *WhiteboardHandler) UpdateNode(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boardID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	nodeID, ok := parseUintParam(c, "nodeId")
	if !ok {
		return
	}
	var req wbNodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	n, err := h.svc.UpdateNode(c.Request.Context(), userID, workspaceID, boardID, nodeID, req.toModel(nodeID))
	if err != nil {
		mapWhiteboardError(c, err)
		return
	}
	response.OK(c, n)
}

func (h *WhiteboardHandler) DeleteNode(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boardID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	nodeID, ok := parseUintParam(c, "nodeId")
	if !ok {
		return
	}
	if err := h.svc.DeleteNode(c.Request.Context(), userID, workspaceID, boardID, nodeID); err != nil {
		mapWhiteboardError(c, err)
		return
	}
	response.OK(c, nil)
}

type wbEdgeRequest struct {
	FromNodeID uint   `json:"from_node_id"`
	ToNodeID   uint   `json:"to_node_id"`
	Label      string `json:"label"`
}

func (h *WhiteboardHandler) CreateEdge(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boardID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req wbEdgeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	e, err := h.svc.CreateEdge(c.Request.Context(), userID, workspaceID, boardID, &model.WhiteboardEdge{
		FromNodeID: req.FromNodeID, ToNodeID: req.ToNodeID, Label: req.Label,
	})
	if err != nil {
		mapWhiteboardError(c, err)
		return
	}
	response.Created(c, e)
}

func (h *WhiteboardHandler) DeleteEdge(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boardID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	edgeID, ok := parseUintParam(c, "edgeId")
	if !ok {
		return
	}
	if err := h.svc.DeleteEdge(c.Request.Context(), userID, workspaceID, boardID, edgeID); err != nil {
		response.NotFound(c, "edge not found")
		return
	}
	response.OK(c, nil)
}

// ExpandNode lists related entities for a node's reference.
func (h *WhiteboardHandler) ExpandNode(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	boardID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	nodeID, ok := parseUintParam(c, "nodeId")
	if !ok {
		return
	}
	items, err := h.svc.Related(c.Request.Context(), userID, workspaceID, boardID, nodeID)
	if err != nil {
		response.NotFound(c, "node not found")
		return
	}
	response.OK(c, items)
}

// parseUintParam reads a numeric path param, replying 400 on garbage.
func parseUintParam(c *gin.Context, name string) (uint, bool) {
	id, err := strconv.ParseUint(c.Param(name), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid "+name)
		return 0, false
	}
	return uint(id), true
}

func mapWhiteboardError(c *gin.Context, err error) {
	switch err {
	case service.ErrWhiteboardNotFound:
		response.NotFound(c, "whiteboard not found")
	case service.ErrWhiteboardNodeNotFound:
		response.NotFound(c, "node not found")
	case service.ErrWhiteboardEdgeNotFound:
		response.NotFound(c, "edge not found")
	case service.ErrWhiteboardNameEmpty:
		response.BadRequest(c, "name is required")
	case service.ErrWhiteboardBadRef:
		response.BadRequest(c, "invalid node ref")
	case service.ErrWhiteboardSelfEdge:
		response.BadRequest(c, "edge endpoints must differ")
	default:
		response.InternalError(c, "whiteboard operation failed")
	}
}
