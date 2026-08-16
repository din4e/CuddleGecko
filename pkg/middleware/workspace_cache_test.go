package middleware

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeChecker struct {
	memberCalls int
	member      bool
	defaultID   uint
	defaultErr  error
}

func (f *fakeChecker) IsMember(_ context.Context, _, _ uint) bool {
	f.memberCalls++
	return f.member
}

func (f *fakeChecker) GetDefaultWorkspaceID(_ context.Context, _ uint) (uint, error) {
	return f.defaultID, f.defaultErr
}

func TestCachingWorkspaceChecker_IsMember(t *testing.T) {
	fake := &fakeChecker{member: true}
	c := NewCachingWorkspaceChecker(fake, time.Minute)

	assert.True(t, c.IsMember(context.Background(), 1, 2))
	assert.True(t, c.IsMember(context.Background(), 1, 2)) // served from cache
	assert.Equal(t, 1, fake.memberCalls, "repeat call must not hit the inner checker")

	// A different (workspace, user) key misses the cache.
	assert.True(t, c.IsMember(context.Background(), 3, 4))
	assert.Equal(t, 2, fake.memberCalls, "different key hits the inner checker")

	// GetDefaultWorkspaceID is passed straight through.
	fake.defaultID = 7
	id, err := c.GetDefaultWorkspaceID(context.Background(), 2)
	require.NoError(t, err)
	assert.Equal(t, uint(7), id)
}

// A false membership result is cached too, so a non-member doesn't trigger a
// query on every request.
func TestCachingWorkspaceChecker_CachesDenial(t *testing.T) {
	fake := &fakeChecker{member: false}
	c := NewCachingWorkspaceChecker(fake, time.Minute)

	assert.False(t, c.IsMember(context.Background(), 1, 2))
	assert.False(t, c.IsMember(context.Background(), 1, 2))
	assert.Equal(t, 1, fake.memberCalls)
}

// After the TTL elapses the inner checker is consulted again.
func TestCachingWorkspaceChecker_Expiry(t *testing.T) {
	fake := &fakeChecker{member: true}
	c := NewCachingWorkspaceChecker(fake, 2*time.Millisecond)

	assert.True(t, c.IsMember(context.Background(), 1, 2))
	time.Sleep(15 * time.Millisecond)
	assert.True(t, c.IsMember(context.Background(), 1, 2))
	assert.Equal(t, 2, fake.memberCalls, "expired entry must re-query")
}
