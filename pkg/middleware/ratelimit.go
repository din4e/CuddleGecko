package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ipWindow struct {
	start time.Time
	count int
}

type IPRateLimiter struct {
	mu       sync.RWMutex
	windows  map[string]*ipWindow
	max      int
	window   time.Duration
}

func NewIPRateLimiter(max int, window time.Duration) *IPRateLimiter {
	l := &IPRateLimiter{
		windows: make(map[string]*ipWindow),
		max:     max,
		window:  window,
	}
	// Sweep stale windows so the map doesn't grow without bound under IP
	// rotation / bot traffic. Guarded so a zero window can't panic the ticker.
	if window > 0 {
		go l.cleanup()
	}
	return l
}

// cleanup periodically drops windows that haven't been touched in a full window.
func (l *IPRateLimiter) cleanup() {
	ticker := time.NewTicker(l.window)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-l.window)
		l.mu.Lock()
		for ip, w := range l.windows {
			if w.start.Before(cutoff) {
				delete(l.windows, ip)
			}
		}
		l.mu.Unlock()
	}
}

func (l *IPRateLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	w, ok := l.windows[ip]
	if !ok || now.Sub(w.start) >= l.window {
		w = &ipWindow{start: now, count: 0}
		l.windows[ip] = w
	}
	if w.count >= l.max {
		return false
	}
	w.count++
	return true
}

func (l *IPRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !l.Allow(ip) {
			c.AbortWithStatus(http.StatusTooManyRequests)
			return
		}
		c.Next()
	}
}
