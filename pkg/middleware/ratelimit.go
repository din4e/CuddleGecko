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
	return &IPRateLimiter{
		windows: make(map[string]*ipWindow),
		max:     max,
		window:  window,
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
