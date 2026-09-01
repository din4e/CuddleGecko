package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func recv(t *testing.T, c *client) []byte {
	t.Helper()
	select {
	case msg := <-c.send:
		return msg
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for broadcast")
		return nil
	}
}

func TestHub_BroadcastWorkspaceIsolation(t *testing.T) {
	h := NewHub()
	a1 := newClient(nil, 1)
	a2 := newClient(nil, 1)
	b1 := newClient(nil, 2)
	h.Register(a1)
	h.Register(a2)
	h.Register(b1)

	h.BroadcastToWorkspace(1, []byte("hi"))

	assert.Equal(t, "hi", string(recv(t, a1)))
	assert.Equal(t, "hi", string(recv(t, a2)))
	assert.Empty(t, b1.send, "workspace 2 client must not receive workspace 1 broadcast")
}

func TestHub_NotifyChangeMarshalsFrame(t *testing.T) {
	h := NewHub()
	c := newClient(nil, 5)
	h.Register(c)

	h.NotifyChange(context.Background(), 5, service.ResourceTodo, service.ChangeUpdated, 42, map[string]any{"id": 42, "title": "x"})

	var f Frame
	require.NoError(t, json.Unmarshal(recv(t, c), &f))
	assert.Equal(t, FrameDataChanged, f.Type)
	assert.Equal(t, uint(5), f.WorkspaceID)
	assert.Equal(t, "todos", f.Resource)
	assert.Equal(t, uint(42), f.ID)
	assert.Equal(t, "updated", f.Kind)
	assert.JSONEq(t, `{"id":42,"title":"x"}`, string(f.Entity))
}

func TestHub_NotifyChangeEntityMarshalFallback(t *testing.T) {
	h := NewHub()
	c := newClient(nil, 5)
	h.Register(c)

	// An unmarshalable entity degrades the frame to a bulk invalidation rather
	// than dropping the change entirely.
	h.NotifyChange(context.Background(), 5, service.ResourceTodo, service.ChangeUpdated, 1, func() {})

	var f Frame
	require.NoError(t, json.Unmarshal(recv(t, c), &f))
	assert.Equal(t, FrameDataChanged, f.Type)
	assert.Equal(t, "bulk", f.Kind)
	assert.Nil(t, f.Entity)
}

func TestHub_SlowClientEvicted(t *testing.T) {
	h := NewHub()
	c := newClient(nil, 9)
	h.Register(c)
	// Fill the buffer to capacity.
	for i := 0; i < sendBufSize; i++ {
		c.send <- []byte("x")
	}
	// One more broadcast overflows the buffer → client is evicted (stop closed).
	h.BroadcastToWorkspace(9, []byte("overflow"))
	select {
	case <-c.stop:
		// expected: evicted
	default:
		t.Fatal("slow client was not evicted on send-buffer overflow")
	}
}

func TestHub_UnregisterCleansUpEmptyWorkspace(t *testing.T) {
	h := NewHub()
	c := newClient(nil, 3)
	h.Register(c)
	require.Len(t, h.clients[3], 1)
	h.Unregister(c)
	_, exists := h.clients[3]
	assert.False(t, exists, "empty workspace set should be removed")
}
