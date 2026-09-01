// Package realtime provides the WebSocket hub that fans entity-change
// notifications out to every connected client of a workspace, enabling
// multi-device sync across all data domains.
package realtime

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/din4e/cuddlegecko/internal/service"
)

// Hub maintains the set of active WebSocket clients grouped by workspace and
// fans out change notifications. It implements service.ChangeNotifier so domain
// services can broadcast mutations without depending on realtime details.
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

// NotifyChange satisfies service.ChangeNotifier. It is fire-and-forget: it
// marshals a Frame (embedding the entity when given) and broadcasts it to the
// workspace; it never blocks on the caller (each client send is non-blocking).
func (h *Hub) NotifyChange(_ context.Context, workspaceID uint, resource string, kind service.ChangeKind, id uint, entity any) {
	frame := Frame{
		Type:        FrameDataChanged,
		WorkspaceID: workspaceID,
		Resource:    resource,
		Kind:        string(kind),
		ID:          id,
	}
	if entity != nil {
		raw, err := json.Marshal(entity)
		if err != nil {
			// Without the entity the frame is still a usable invalidation
			// signal — broadcast it rather than dropping the change entirely.
			frame.Kind = string(service.ChangeBulk)
		} else {
			frame.Entity = raw
		}
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
