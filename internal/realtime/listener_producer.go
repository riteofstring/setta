package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
)

type ListenerProducerOptions struct {
	Broadcaster  *ListenerBroadcaster
	ProjectState *projectstate.Runtime
	Deployment   *deployments.Runtime
}

type ListenerProducer struct {
	broadcaster  *ListenerBroadcaster
	projectState *projectstate.Runtime
	deployment   *deployments.Runtime
}

type EmitUIChangeParams struct {
	ProjectID      string
	ShareSessionID string
	DependencyKey  json.RawMessage
	Value          json.RawMessage
	BinaryPayload  []byte
}

type EmitDependencyEventParams struct {
	ProjectID      string
	ShareSessionID string
	DependencyKey  json.RawMessage
	Payload        json.RawMessage
	TimestampMS    int64
	BinaryPayload  []byte
}

func NewListenerProducer(options ListenerProducerOptions) *ListenerProducer {
	broadcaster := options.Broadcaster
	if broadcaster == nil {
		broadcaster = NewListenerBroadcaster(ListenerBroadcasterOptions{})
	}

	return &ListenerProducer{
		broadcaster:  broadcaster,
		projectState: options.ProjectState,
		deployment:   options.Deployment,
	}
}

func (p *ListenerProducer) EmitUIChange(ctx context.Context, params EmitUIChangeParams) (uint64, int, error) {
	projectID, err := p.requireProjectScope(params.ProjectID, params.ShareSessionID)
	if err != nil {
		return 0, 0, err
	}

	dependency, err := CanonicalDependencyKey(params.DependencyKey)
	if err != nil {
		return 0, 0, err
	}

	delta := ListenerRealtimeDelta{
		Dependency:    dependency,
		Value:         cloneRawMessage(params.Value),
		BinaryPayload: cloneBytes(params.BinaryPayload),
	}
	if params.BinaryPayload != nil {
		return p.broadcaster.EmitRealtimeDeltasBinary(ctx, EmitRealtimeDeltasBinaryParams{
			ProjectID:      projectID,
			ShareSessionID: strings.TrimSpace(params.ShareSessionID),
			Deltas:         []ListenerRealtimeDelta{delta},
			BinaryPayload:  cloneBytes(params.BinaryPayload),
		})
	}

	return p.broadcaster.EmitRealtimeDeltas(ctx, EmitRealtimeDeltasParams{
		ProjectID:      projectID,
		ShareSessionID: strings.TrimSpace(params.ShareSessionID),
		Deltas:         []ListenerRealtimeDelta{delta},
	})
}

func (p *ListenerProducer) EmitDependencyEvent(ctx context.Context, params EmitDependencyEventParams) (uint64, int, error) {
	projectID, err := p.requireProjectScope(params.ProjectID, params.ShareSessionID)
	if err != nil {
		return 0, 0, err
	}

	dependency, err := CanonicalDependencyKey(params.DependencyKey)
	if err != nil {
		return 0, 0, err
	}

	event := ListenerDependencyEvent{
		DependencyKey: dependency,
		Payload:       cloneRawMessage(params.Payload),
		TimestampMS:   params.TimestampMS,
		BinaryPayload: cloneBytes(params.BinaryPayload),
	}
	if params.BinaryPayload != nil {
		return p.broadcaster.EmitDependencyEventsBinary(ctx, EmitDependencyEventsBinaryParams{
			ProjectID:        projectID,
			ShareSessionID:   strings.TrimSpace(params.ShareSessionID),
			DependencyEvents: []ListenerDependencyEvent{event},
			BinaryPayload:    cloneBytes(params.BinaryPayload),
		})
	}

	return p.broadcaster.EmitDependencyEvents(ctx, EmitDependencyEventsParams{
		ProjectID:      projectID,
		ShareSessionID: strings.TrimSpace(params.ShareSessionID),
		DependencyEvents: []ListenerDependencyEvent{
			event,
		},
	})
}

func (p *ListenerProducer) requireProjectScope(projectID string, shareSessionID string) (string, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return "", projectstate.ErrProjectIDRequired
	}

	if p.deployment != nil {
		snapshot, err := p.deployment.SessionSnapshot(shareSessionID)
		if err != nil {
			return "", err
		}
		if _, err := snapshot.Document.ProjectByID(projectID); err != nil {
			return "", err
		}
		return projectID, nil
	}

	if p.projectState == nil {
		return "", fmt.Errorf("listener producer project runtime is required")
	}
	if _, err := p.projectState.Snapshot().Document.ProjectByID(projectID); err != nil {
		return "", err
	}
	return projectID, nil
}

func cloneBytes(payload []byte) []byte {
	if payload == nil {
		return nil
	}

	cloned := make([]byte, len(payload))
	copy(cloned, payload)
	return cloned
}
