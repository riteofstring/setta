package app

import (
	"context"
	"errors"
	"time"

	"setta/internal/deployments"
	"setta/internal/realtime"
	"setta/internal/shareartifacts"
	"setta/internal/terminals"
)

const defaultDeploymentSessionCleanupInterval = 5 * time.Minute

func runDeploymentSessionCleanupLoop(
	ctx context.Context,
	deploymentRuntime *deployments.Runtime,
	terminalService *terminals.Service,
	listenerBroadcaster *realtime.ListenerBroadcaster,
	shareArtifacts *shareartifacts.Service,
	interval time.Duration,
) error {
	if deploymentRuntime == nil {
		return nil
	}
	if interval <= 0 {
		interval = defaultDeploymentSessionCleanupInterval
	}

	for {
		if _, err := cleanupExpiredDeploymentSessions(ctx, deploymentRuntime, terminalService, listenerBroadcaster, shareArtifacts); err != nil {
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

func cleanupExpiredDeploymentSessions(
	ctx context.Context,
	deploymentRuntime *deployments.Runtime,
	terminalService *terminals.Service,
	listenerBroadcaster *realtime.ListenerBroadcaster,
	shareArtifacts *shareartifacts.Service,
) ([]string, error) {
	if deploymentRuntime == nil {
		return nil, nil
	}

	expiredSessionIDs, err := deploymentRuntime.CleanupExpiredSessions()
	if len(expiredSessionIDs) == 0 {
		return nil, err
	}

	for _, sessionID := range expiredSessionIDs {
		if terminalService != nil {
			err = errors.Join(err, terminalService.DeleteShareSession(ctx, sessionID))
		}
		if listenerBroadcaster != nil {
			listenerBroadcaster.DropShareSession(sessionID)
		}
		if shareArtifacts != nil {
			shareArtifacts.DeleteShareSession(sessionID)
		}
	}
	return expiredSessionIDs, err
}
