package realtime

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	// FrameDataChanged is the only frame type: an entity in this workspace
	// changed; kind/entity tell the client whether to patch its cache or
	// refetch the affected list.
	FrameDataChanged = "data.changed"

	sendBufSize = 16 // per-client outbound buffer; overflow evicts the client
	writeWait   = 10 * time.Second
	pingPeriod  = 30 * time.Second
)

// Frame is the JSON message pushed from server to client over the socket.
// Entity, when present, is the mutated object marshaled exactly as the REST
// API returns it, so clients can patch it into cached query results verbatim.
type Frame struct {
	Type        string          `json:"type"` // always "data.changed"
	WorkspaceID uint            `json:"workspace_id"`
	Resource    string          `json:"resource"` // todos|contacts|transactions|…
	Kind        string          `json:"kind"`     // created|updated|deleted|items_changed|bulk
	ID          uint            `json:"id,omitempty"`
	Entity      json.RawMessage `json:"entity,omitempty"`
}

// client is one WebSocket connection scoped to a single workspace.
type client struct {
	conn        *websocket.Conn
	workspaceID uint
	send        chan []byte
	stop        chan struct{}
	stopOnce    sync.Once
}

func newClient(conn *websocket.Conn, workspaceID uint) *client {
	return &client{
		conn:        conn,
		workspaceID: workspaceID,
		send:        make(chan []byte, sendBufSize),
		stop:        make(chan struct{}),
	}
}

// evict signals the read/write pumps to tear this client down. Idempotent.
func (c *client) evict() {
	c.stopOnce.Do(func() { close(c.stop) })
}

// ServeWS registers conn with the hub and runs the read + write pumps until the
// connection closes (peer disconnect, eviction, or context cancellation), then
// unregisters. It blocks the caller — the HTTP handler stays alive for the
// socket's lifetime, exactly like a streaming/SSE handler.
func ServeWS(ctx context.Context, hub *Hub, conn *websocket.Conn, workspaceID uint) {
	c := newClient(conn, workspaceID)
	hub.Register(c)
	defer hub.Unregister(c)
	defer conn.Close(websocket.StatusNormalClosure, "closing")

	// readPump cancels the connection when the peer goes away; we don't expect
	// inbound messages (the server only pushes).
	go c.readPump(ctx)
	c.writePump(ctx)
}

// readPump reads (and discards) inbound frames so the server detects disconnects.
func (c *client) readPump(ctx context.Context) {
	for {
		if _, _, err := c.conn.Read(ctx); err != nil {
			c.evict()
			return
		}
	}
}

// writePump pushes queued broadcasts and periodic pings until teardown.
func (c *client) writePump(ctx context.Context) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			wctx, cancel := context.WithTimeout(ctx, writeWait)
			err := c.conn.Write(wctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ticker.C:
			wctx, cancel := context.WithTimeout(ctx, writeWait)
			err := c.conn.Ping(wctx)
			cancel()
			if err != nil {
				return
			}
		case <-c.stop:
			return
		case <-ctx.Done():
			return
		}
	}
}
