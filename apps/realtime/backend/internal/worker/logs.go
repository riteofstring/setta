package worker

import (
	"errors"
	"sync"
)

type BoundedLog struct {
	mu        sync.Mutex
	content   []byte
	maximum   int
	truncated bool
}

func NewBoundedLog(maximum int) (*BoundedLog, error) {
	if maximum < 1 {
		return nil, errors.New("worker: log byte limit must be positive")
	}
	return &BoundedLog{maximum: maximum}, nil
}

func (log *BoundedLog) Write(content []byte) (int, error) {
	if log == nil {
		return 0, errors.New("worker: log is unavailable")
	}
	log.mu.Lock()
	defer log.mu.Unlock()
	count := len(content)
	remaining := log.maximum - len(log.content)
	if remaining < len(content) {
		log.truncated = true
	}
	if remaining > 0 {
		if len(content) > remaining {
			content = content[:remaining]
		}
		log.content = append(log.content, content...)
	}
	return count, nil
}

func (log *BoundedLog) Snapshot() (string, bool) {
	if log == nil {
		return "", false
	}
	log.mu.Lock()
	defer log.mu.Unlock()
	return string(append([]byte(nil), log.content...)), log.truncated
}
