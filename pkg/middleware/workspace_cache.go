package middleware

import (
	"context"
	"sync"
	"time"
)

// memberTTL bounds how long an IsMember result is reused. Workspace membership
// changes rarely, so a short TTL keeps the middleware off the DB for the vast
// majority of (very frequent) authenticated requests while still converging
// quickly when membership does change.
const memberTTL = 30 * time.Second

type memberKey struct {
	workspaceID, userID uint
}

type memberEntry struct {
	member bool
	at     time.Time
}

// cachingChecker wraps a WorkspaceMemberChecker with a short-TTL cache for
// IsMember. The auth middleware runs IsMember on every authenticated request;
// caching it avoids a workspace_members COUNT per request. A removed member can
// retain access for at most memberTTL — an acceptable tradeoff for an app where
// membership changes are rare.
type cachingChecker struct {
	inner WorkspaceMemberChecker
	mu    sync.Mutex
	cache map[memberKey]memberEntry
	ttl   time.Duration
}

// NewCachingWorkspaceChecker wraps inner with a membership-result cache.
func NewCachingWorkspaceChecker(inner WorkspaceMemberChecker, ttl time.Duration) WorkspaceMemberChecker {
	c := &cachingChecker{inner: inner, cache: make(map[memberKey]memberEntry), ttl: ttl}
	// Sweep expired entries so the cache doesn't grow without bound as distinct
	// (workspace, user) pairs are seen. Guarded so a zero ttl can't panic.
	if ttl > 0 {
		go c.cleanup()
	}
	return c
}

// cleanup periodically drops membership entries older than the TTL.
func (c *cachingChecker) cleanup() {
	ticker := time.NewTicker(c.ttl)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-c.ttl)
		c.mu.Lock()
		for k, e := range c.cache {
			if e.at.Before(cutoff) {
				delete(c.cache, k)
			}
		}
		c.mu.Unlock()
	}
}

func (c *cachingChecker) IsMember(ctx context.Context, workspaceID, userID uint) bool {
	key := memberKey{workspaceID, userID}
	c.mu.Lock()
	if e, ok := c.cache[key]; ok && time.Since(e.at) < c.ttl {
		c.mu.Unlock()
		return e.member
	}
	c.mu.Unlock()

	member := c.inner.IsMember(ctx, workspaceID, userID)

	c.mu.Lock()
	c.cache[key] = memberEntry{member: member, at: time.Now()}
	c.mu.Unlock()
	return member
}

func (c *cachingChecker) GetDefaultWorkspaceID(ctx context.Context, userID uint) (uint, error) {
	return c.inner.GetDefaultWorkspaceID(ctx, userID)
}
