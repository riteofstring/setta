package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

const CapabilityEmitListenerEvents = "emitListenerEvents"

var (
	ErrWorkerHostListenerProducerRequired = errors.New("plugins: listener producer is required")
	ErrWorkerHostCapabilityDenied         = errors.New("plugins: emitListenerEvents capability is required")
	ErrWorkerHostDependencyEventsRequired = errors.New("plugins: dependency events must contain at least one entry")
	ErrWorkerHostShareSessionRequired     = errors.New("plugins: share session id is required in deployment mode")
)

type WorkerHostOptions struct {
	ListenerProducer *realtime.ListenerProducer
	Deployment       *deployments.Runtime
}

type WorkerContext struct {
	PluginID              string
	EffectiveCapabilities []string
}

type ListenerDependencyEvent struct {
	DependencyKey json.RawMessage `json:"dependencyKey"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	TimestampMS   int64           `json:"timestampMs"`
}

type EmitListenerDependencyEventsRequest struct {
	ProjectID        string                    `json:"projectConfigId"`
	DependencyEvents []ListenerDependencyEvent `json:"dependencyEvents"`
	ShareSessionID   string                    `json:"shareSessionId,omitempty"`
}

type WorkerHost struct {
	listener   *realtime.ListenerProducer
	deployment *deployments.Runtime
}

func NewWorkerHost(options WorkerHostOptions) (*WorkerHost, error) {
	if options.ListenerProducer == nil {
		return nil, ErrWorkerHostListenerProducerRequired
	}

	return &WorkerHost{
		listener:   options.ListenerProducer,
		deployment: options.Deployment,
	}, nil
}

func (h *WorkerHost) EmitListenerDependencyEvents(
	ctx context.Context,
	worker WorkerContext,
	request EmitListenerDependencyEventsRequest,
) error {
	if h == nil || h.listener == nil {
		return ErrWorkerHostListenerProducerRequired
	}
	if !worker.hasCapability(CapabilityEmitListenerEvents) {
		return ErrWorkerHostCapabilityDenied
	}

	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" {
		return projectstate.ErrProjectIDRequired
	}
	if len(request.DependencyEvents) == 0 {
		return ErrWorkerHostDependencyEventsRequired
	}

	shareSessionID := strings.TrimSpace(request.ShareSessionID)
	if h.deployment != nil {
		if shareSessionID == "" {
			return ErrWorkerHostShareSessionRequired
		}
		if err := h.deployment.TouchSession(shareSessionID); err != nil {
			return err
		}
	}

	events := make([]realtime.DependencyEventInput, 0, len(request.DependencyEvents))
	for _, event := range request.DependencyEvents {
		events = append(events, realtime.DependencyEventInput{
			DependencyKey: append(json.RawMessage(nil), event.DependencyKey...),
			Payload:       append(json.RawMessage(nil), event.Payload...),
			TimestampMS:   event.TimestampMS,
		})
	}

	if _, _, err := h.listener.EmitDependencyEvents(ctx, realtime.ProduceDependencyEventsParams{
		ProjectID:        projectID,
		ShareSessionID:   shareSessionID,
		DependencyEvents: events,
	}); err != nil {
		return fmt.Errorf("emit plugin listener dependency events: %w", err)
	}
	return nil
}

func (c WorkerContext) hasCapability(capability string) bool {
	capability = strings.TrimSpace(capability)
	if capability == "" {
		return false
	}
	for _, existing := range c.EffectiveCapabilities {
		if strings.TrimSpace(existing) == capability {
			return true
		}
	}
	return false
}
