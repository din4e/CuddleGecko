package mcp

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// session stores a session ID with its last activity time.
type session struct {
	id        string
	lastSeen  time.Time
}

var (
	sessions   sync.Map // map[string]*session
)

func init() {
	go cleanupSessions()
}

// cleanupSessions removes sessions older than 30 minutes, runs every 5 minutes.
func cleanupSessions() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		sessions.Range(func(key, value interface{}) bool {
			s := value.(*session)
			if now.Sub(s.lastSeen) > 30*time.Minute {
				sessions.Delete(key)
			}
			return true
		})
	}
}

// getOrCreateSession returns an existing session or creates a new one.
func getOrCreateSession(c *gin.Context) string {
	sid := c.GetHeader("Mcp-Session-Id")
	if sid != "" {
		if v, ok := sessions.Load(sid); ok {
			s := v.(*session)
			s.lastSeen = time.Now()
			return sid
		}
	}

	newID := generateSessionID()
	s := &session{id: newID, lastSeen: time.Now()}
	sessions.Store(newID, s)
	return newID
}

// HandlePost handles incoming MCP requests over Streamable HTTP.
func (s *MCPServer) HandlePost(c *gin.Context) {
	sessionID := getOrCreateSession(c)
	c.Header("Mcp-Session-Id", sessionID)

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: InvalidRequest, Message: "unauthorized"},
		})
		return
	}
	userID := userIDVal.(uint)

	workspaceIDVal, exists := c.Get("workspace_id")
	if !exists {
		c.JSON(http.StatusBadRequest, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: InvalidRequest, Message: "workspace required"},
		})
		return
	}
	workspaceID := workspaceIDVal.(uint)

	var req JSONRPCRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: ParseError, Message: "parse error"},
		})
		return
	}

	if req.JSONRPC != "2.0" {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &JSONRPCError{Code: InvalidRequest, Message: "invalid jsonrpc version"},
		})
		return
	}

	resp := s.HandleMethod(req.Method, req.Params, userID, workspaceID)
	resp.ID = req.ID

	// For notifications (no id), respond with 202 Accepted and no body
	if req.ID == nil {
		c.Status(http.StatusAccepted)
		return
	}

	c.JSON(http.StatusOK, resp)
}

// HandlePostNoWorkspace handles MCP requests that don't require a workspace context.
func (s *MCPServer) HandlePostNoWorkspace(c *gin.Context) {
	sessionID := getOrCreateSession(c)
	c.Header("Mcp-Session-Id", sessionID)

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: InvalidRequest, Message: "unauthorized"},
		})
		return
	}
	userID := userIDVal.(uint)

	var req JSONRPCRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: ParseError, Message: "parse error"},
		})
		return
	}

	if req.JSONRPC != "2.0" {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &JSONRPCError{Code: InvalidRequest, Message: "invalid jsonrpc version"},
		})
		return
	}

	// Use workspaceID=0 for workspace-independent operations
	resp := s.HandleMethod(req.Method, req.Params, userID, 0)
	resp.ID = req.ID

	if req.ID == nil {
		c.Status(http.StatusAccepted)
		return
	}

	c.JSON(http.StatusOK, resp)
}

// generateSessionID creates a simple unique session identifier.
func generateSessionID() string {
	return fmtSessionID()
}

func fmtSessionID() string {
	return time.Now().Format("20060102150405") + "-" + randomHex(8)
}

func randomHex(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = "0123456789abcdef"[time.Now().UnixNano()%16]
	}
	return string(b)
}

// Ensure json import is used
var _ = json.Marshal
