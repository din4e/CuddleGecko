// Package realtime provides the WebSocket hub that fans todo change
// notifications out to every connected client of a workspace, enabling
// multi-device sync.
package realtime

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/din4e/cuddlegecko/internal/service"
)

// Hub maintains the set of active WebSocket clients grouped by workspace and
// fans out change notifications. It implements service.TodoChangeNotifier so the
// todo service can broadcast mutations without depending on realtime details.
type Hub struct {
	mu      sync.RWMutex
	clients map[uint]map[*client]struct{} // workspaceID -> connected clients
}

func NewHub() *Hub {
	return &Hub{clients: make(map[uint]map[*client]struct{})}
}

// Register adds a client to its workspace's client set.
func (h *Hub) Register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set, ok := h.clients[c.workspaceID]
	if !ok {
		set = make(map[*client]struct{})
		h.clients[c.workspaceID] = set
	}
	set[c] = struct{}{}
}

// Unregister removes a client from its workspace's set (no-op if absent).
func (h *Hub) Unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set, ok := h.clients[c.workspaceID]
	if !ok {
		return
	}
	delete(set, c)
	if len(set) == 0 {
		delete(h.clients, c.workspaceID)
	}
}

// BroadcastToWorkspace delivers payload to every client in the workspace. Sends
// are non-blocking: a client whose send buffer is full (slow consumer) is
// evicted so a broadcaster never blocks on one stalled reader.
func (h *Hub) BroadcastToWorkspace(workspaceID uint, payload []byte) {
	h.mu.RLock()
	set := h.clients[workspaceID]
	snapshot := make([]*client, 0, len(set))
	for c := range set {
		snapshot = append(snapshot, c)
	}
	h.mu.RUnlock()

	for _, c := range snapshot {
		select {
		case c.send <- payload:
		default:
			c.evict() // slow client: force teardown
		}
	}
}

// NotifyTodoChange satisfies service.TodoChangeNotifier. It is fire-and-forget:
// it marshals a Frame and broadcasts it to the workspace, and never blocks on
// the caller (each client send is non-blocking).
func (h *Hub) NotifyTodoChange(_ context.Context, workspaceID, todoID uint, kind service.TodoChangeKind) {
	frame := Frame{
		Type:        FrameTodoChanged,
		WorkspaceID: workspaceID,
		TodoID:      todoID,
		Kind:        string(kind),
	}
	payload, err := json.Marshal(frame)
	if err != nil {
		return
	}
	h.BroadcastToWorkspace(workspaceID, payload)
}

// Close evicts every client (used during graceful shutdown).
func (h *Hub) Close() {
	h.mu.Lock()
	all := h.clients
	h.clients = make(map[uint]map[*client]struct{})
	h.mu.Unlock()
	for _, set := range all {
		for c := range set {
			c.evict()
		}
	}
}
