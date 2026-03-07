package realtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	binarypayload "setta/internal/binary"
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

type DependencyEventInput struct {
	DependencyKey json.RawMessage
	Payload       json.RawMessage
	TimestampMS   int64
	BinaryPayload []byte
}

type ProduceDependencyEventsParams struct {
	ProjectID        string
	ShareSessionID   string
	DependencyEvents []DependencyEventInput
}

type BinarySectionDelta struct {
	SectionID     string
	Value         binarypayload.ContentRef
	BinaryPayload []byte
}

type EmitSectionBinaryDeltasParams struct {
	ProjectID      string
	ShareSessionID string
	Deltas         []BinarySectionDelta
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
	return p.EmitDependencyEvents(ctx, ProduceDependencyEventsParams{
		ProjectID:      params.ProjectID,
		ShareSessionID: params.ShareSessionID,
		DependencyEvents: []DependencyEventInput{
			{
				DependencyKey: params.DependencyKey,
				Payload:       params.Payload,
				TimestampMS:   params.TimestampMS,
				BinaryPayload: params.BinaryPayload,
			},
		},
	})
}

func (p *ListenerProducer) EmitDependencyEvents(ctx context.Context, params ProduceDependencyEventsParams) (uint64, int, error) {
	projectID, err := p.requireProjectScope(params.ProjectID, params.ShareSessionID)
	if err != nil {
		return 0, 0, err
	}

	if len(params.DependencyEvents) == 0 {
		return 0, 0, ErrEmptyDependencyEvents
	}

	events := make([]ListenerDependencyEvent, 0, len(params.DependencyEvents))
	for _, rawEvent := range params.DependencyEvents {
		if rawEvent.BinaryPayload != nil {
			return 0, 0, fmt.Errorf("realtime: batched binary dependency events are not supported")
		}

		dependency, err := CanonicalDependencyKey(rawEvent.DependencyKey)
		if err != nil {
			return 0, 0, err
		}
		events = append(events, ListenerDependencyEvent{
			DependencyKey: dependency,
			Payload:       cloneRawMessage(rawEvent.Payload),
			TimestampMS:   rawEvent.TimestampMS,
		})
	}

	return p.broadcaster.EmitDependencyEvents(ctx, EmitDependencyEventsParams{
		ProjectID:        projectID,
		ShareSessionID:   strings.TrimSpace(params.ShareSessionID),
		DependencyEvents: events,
	})
}

func (p *ListenerProducer) EmitSectionBinaryDeltas(ctx context.Context, params EmitSectionBinaryDeltasParams) error {
	if len(params.Deltas) == 0 {
		return ErrEmptyRealtimeDeltas
	}

	projectID, err := p.requireProjectScope(params.ProjectID, params.ShareSessionID)
	if err != nil {
		return err
	}

	shareSessionID := strings.TrimSpace(params.ShareSessionID)
	type groupedDeltas struct {
		payload []byte
		deltas  []ListenerRealtimeDelta
	}

	groupOrder := make([]string, 0, len(params.Deltas))
	groups := make(map[string]*groupedDeltas, len(params.Deltas))

	for _, delta := range params.Deltas {
		sectionID := strings.TrimSpace(delta.SectionID)
		if sectionID == "" {
			return projectstate.ErrSectionIDRequired
		}

		contentID := strings.TrimSpace(delta.Value.ContentID)
		if contentID == "" {
			return binarypayload.ErrContentIDRequired
		}

		value, err := marshalBinaryDependencyValue(delta.Value)
		if err != nil {
			return err
		}

		group, ok := groups[contentID]
		if !ok {
			group = &groupedDeltas{
				payload: cloneBytes(delta.BinaryPayload),
				deltas:  make([]ListenerRealtimeDelta, 0, 1),
			}
			groups[contentID] = group
			groupOrder = append(groupOrder, contentID)
		} else if delta.BinaryPayload != nil && group.payload != nil && !bytes.Equal(group.payload, delta.BinaryPayload) {
			return fmt.Errorf("listener producer: conflicting binary payload for content %q", contentID)
		} else if group.payload == nil {
			group.payload = cloneBytes(delta.BinaryPayload)
		}

		group.deltas = append(group.deltas, ListenerRealtimeDelta{
			Dependency:    sectionID,
			Value:         value,
			BinaryPayload: cloneBytes(delta.BinaryPayload),
		})
	}

	for _, contentID := range groupOrder {
		group := groups[contentID]
		if _, _, err := p.broadcaster.EmitRealtimeDeltasBinary(ctx, EmitRealtimeDeltasBinaryParams{
			ProjectID:      projectID,
			ShareSessionID: shareSessionID,
			Deltas:         group.deltas,
			BinaryPayload:  cloneBytes(group.payload),
		}); err != nil {
			return err
		}
	}

	return nil
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

func marshalBinaryDependencyValue(ref binarypayload.ContentRef) (json.RawMessage, error) {
	payload, err := json.Marshal(struct {
		Type    string                   `json:"type"`
		Payload binarypayload.ContentRef `json:"payload"`
	}{
		Type:    DependencyValueTypeBinary,
		Payload: ref,
	})
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func cloneBytes(payload []byte) []byte {
	if payload == nil {
		return nil
	}

	cloned := make([]byte, len(payload))
	copy(cloned, payload)
	return cloned
}
