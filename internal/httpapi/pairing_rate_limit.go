package httpapi

import (
	"sync"
	"time"
)

type PairingFailureLimiter struct {
	clock  func() time.Time
	limit  int
	window time.Duration

	mu          sync.Mutex
	failures    int
	windowStart time.Time
}

func NewPairingFailureLimiter(limit int, window time.Duration) *PairingFailureLimiter {
	return &PairingFailureLimiter{
		clock:  time.Now,
		limit:  limit,
		window: window,
	}
}

func NewPairingFailureLimiterWithClock(
	limit int,
	window time.Duration,
	clock func() time.Time,
) *PairingFailureLimiter {
	limiter := NewPairingFailureLimiter(limit, window)
	limiter.clock = clock
	return limiter
}

func (limiter *PairingFailureLimiter) AllowAttempt() bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.resetExpiredWindowLocked(limiter.clock())
	return limiter.failures < limiter.limit
}

func (limiter *PairingFailureLimiter) RecordFailure() {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.resetExpiredWindowLocked(limiter.clock())
	limiter.failures += 1
}

func (limiter *PairingFailureLimiter) resetExpiredWindowLocked(now time.Time) {
	if limiter.windowStart.IsZero() || !now.Before(limiter.windowStart.Add(limiter.window)) {
		limiter.windowStart = now
		limiter.failures = 0
	}
}
