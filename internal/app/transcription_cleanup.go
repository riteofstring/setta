package app

import (
	"context"
	"time"

	"setta/internal/transcriptionsessions"
)

const defaultTranscriptionSessionCleanupInterval = 5 * time.Minute

func runTranscriptionSessionCleanupLoop(
	ctx context.Context,
	service *transcriptionsessions.Service,
	interval time.Duration,
) error {
	if service == nil {
		return nil
	}
	if interval <= 0 {
		interval = defaultTranscriptionSessionCleanupInterval
	}

	for {
		if err := service.PruneExpiredSessions(ctx); err != nil {
			return err
		}

		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}
