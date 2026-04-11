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

type listenerProducerScope struct {
	projectID      string
	shareSessionID string
	project        projectstate.Project
}

type listenerSectionBinaryDeltaGroup struct {
	contentID string
	payload   []byte
	deltas    []ListenerRealtimeDelta
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
	project, err := p.projectForScope(projectID, params.ShareSessionID)
	if err != nil {
		return 0, 0, err
	}
	dependencyValues, err := BuildListenerRealtimeDependencyValues(project, []ListenerRealtimeDelta{delta})
	if err != nil {
		return 0, 0, err
	}
	if params.BinaryPayload != nil {
		return p.broadcaster.EmitRealtimeDeltasBinary(ctx, EmitRealtimeDeltasBinaryParams{
			ProjectID:        projectID,
			ShareSessionID:   strings.TrimSpace(params.ShareSessionID),
			Deltas:           []ListenerRealtimeDelta{delta},
			DependencyValues: dependencyValues,
			MatchDependencies: listenerRealtimeMatchDependenciesForValues(
				[]ListenerRealtimeDelta{delta},
				dependencyValues,
			),
			BinaryPayload: cloneBytes(params.BinaryPayload),
		})
	}

	return p.broadcaster.EmitRealtimeDeltas(ctx, EmitRealtimeDeltasParams{
		ProjectID:        projectID,
		ShareSessionID:   strings.TrimSpace(params.ShareSessionID),
		Deltas:           []ListenerRealtimeDelta{delta},
		DependencyValues: dependencyValues,
		MatchDependencies: listenerRealtimeMatchDependenciesForValues(
			[]ListenerRealtimeDelta{delta},
			dependencyValues,
		),
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
	var binaryPayload []byte
	for _, rawEvent := range params.DependencyEvents {
		if rawEvent.BinaryPayload != nil {
			if binaryPayload == nil {
				binaryPayload = cloneBytes(rawEvent.BinaryPayload)
			} else if !bytes.Equal(binaryPayload, rawEvent.BinaryPayload) {
				return 0, 0, fmt.Errorf("realtime: conflicting binary payload for dependency events")
			}
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

	if binaryPayload != nil {
		return p.broadcaster.EmitDependencyEventsBinary(ctx, EmitDependencyEventsBinaryParams{
			ProjectID:        projectID,
			ShareSessionID:   strings.TrimSpace(params.ShareSessionID),
			DependencyEvents: events,
			BinaryPayload:    binaryPayload,
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

	scope, err := p.resolveScope(params.ProjectID, params.ShareSessionID)
	if err != nil {
		return err
	}
	groups, err := groupSectionBinaryDeltas(params.Deltas)
	if err != nil {
		return err
	}
	return p.emitSectionBinaryDeltaGroups(ctx, scope, groups)
}

func (p *ListenerProducer) resolveScope(projectID string, shareSessionID string) (listenerProducerScope, error) {
	scopedProjectID, err := p.requireProjectScope(projectID, shareSessionID)
	if err != nil {
		return listenerProducerScope{}, err
	}
	project, err := p.projectForScope(scopedProjectID, shareSessionID)
	if err != nil {
		return listenerProducerScope{}, err
	}
	return listenerProducerScope{
		projectID:      scopedProjectID,
		shareSessionID: strings.TrimSpace(shareSessionID),
		project:        project,
	}, nil
}

func groupSectionBinaryDeltas(rawDeltas []BinarySectionDelta) ([]listenerSectionBinaryDeltaGroup, error) {
	groupOrder := make([]string, 0, len(rawDeltas))
	groups := make(map[string]*listenerSectionBinaryDeltaGroup, len(rawDeltas))

	for _, rawDelta := range rawDeltas {
		contentID, groupPayload, delta, err := newListenerSectionBinaryDelta(rawDelta)
		if err != nil {
			return nil, err
		}
		var appendErr error
		groupOrder, appendErr = appendListenerSectionBinaryDelta(groups, groupOrder, contentID, groupPayload, delta)
		if appendErr != nil {
			return nil, appendErr
		}
	}

	return orderedListenerSectionBinaryDeltaGroups(groups, groupOrder), nil
}

func newListenerSectionBinaryDelta(rawDelta BinarySectionDelta) (string, []byte, ListenerRealtimeDelta, error) {
	sectionID := strings.TrimSpace(rawDelta.SectionID)
	if sectionID == "" {
		return "", nil, ListenerRealtimeDelta{}, projectstate.ErrSectionIDRequired
	}

	contentID := strings.TrimSpace(rawDelta.Value.ContentID)
	if contentID == "" {
		return "", nil, ListenerRealtimeDelta{}, binarypayload.ErrContentIDRequired
	}

	value, err := marshalBinaryDependencyValue(rawDelta.Value)
	if err != nil {
		return "", nil, ListenerRealtimeDelta{}, err
	}

	return contentID, cloneBytes(rawDelta.BinaryPayload), ListenerRealtimeDelta{
		Dependency:    sectionID,
		Value:         value,
		BinaryPayload: cloneBytes(rawDelta.BinaryPayload),
	}, nil
}

func appendListenerSectionBinaryDelta(
	groups map[string]*listenerSectionBinaryDeltaGroup,
	groupOrder []string,
	contentID string,
	payload []byte,
	delta ListenerRealtimeDelta,
) ([]string, error) {
	group, ok := groups[contentID]
	if !ok {
		groups[contentID] = &listenerSectionBinaryDeltaGroup{
			contentID: contentID,
			payload:   payload,
			deltas:    []ListenerRealtimeDelta{delta},
		}
		return append(groupOrder, contentID), nil
	}
	if err := group.setPayload(payload); err != nil {
		return nil, err
	}
	group.deltas = append(group.deltas, delta)
	return groupOrder, nil
}

func (g *listenerSectionBinaryDeltaGroup) setPayload(payload []byte) error {
	switch {
	case payload == nil:
		return nil
	case g.payload == nil:
		g.payload = payload
		return nil
	case bytes.Equal(g.payload, payload):
		return nil
	default:
		return fmt.Errorf("listener producer: conflicting binary payload for content %q", g.contentID)
	}
}

func orderedListenerSectionBinaryDeltaGroups(
	groups map[string]*listenerSectionBinaryDeltaGroup,
	groupOrder []string,
) []listenerSectionBinaryDeltaGroup {
	ordered := make([]listenerSectionBinaryDeltaGroup, 0, len(groupOrder))
	for _, contentID := range groupOrder {
		ordered = append(ordered, *groups[contentID])
	}
	return ordered
}

func (p *ListenerProducer) emitSectionBinaryDeltaGroups(
	ctx context.Context,
	scope listenerProducerScope,
	groups []listenerSectionBinaryDeltaGroup,
) error {
	for _, group := range groups {
		if err := p.emitSectionBinaryDeltaGroup(ctx, scope, group); err != nil {
			return err
		}
	}
	return nil
}

func (p *ListenerProducer) emitSectionBinaryDeltaGroup(
	ctx context.Context,
	scope listenerProducerScope,
	group listenerSectionBinaryDeltaGroup,
) error {
	dependencyValues, err := BuildListenerRealtimeDependencyValues(scope.project, group.deltas)
	if err != nil {
		return err
	}
	_, _, err = p.broadcaster.EmitRealtimeDeltasBinary(ctx, EmitRealtimeDeltasBinaryParams{
		ProjectID:        scope.projectID,
		ShareSessionID:   scope.shareSessionID,
		Deltas:           group.deltas,
		DependencyValues: dependencyValues,
		MatchDependencies: listenerRealtimeMatchDependenciesForValues(
			group.deltas,
			dependencyValues,
		),
		BinaryPayload: cloneBytes(group.payload),
	})
	return err
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

func (p *ListenerProducer) projectForScope(projectID string, shareSessionID string) (projectstate.Project, error) {
	if p.deployment != nil {
		snapshot, err := p.deployment.SessionSnapshot(shareSessionID)
		if err != nil {
			return projectstate.Project{}, err
		}
		return snapshot.Document.ProjectByID(projectID)
	}

	if p.projectState == nil {
		return projectstate.Project{}, fmt.Errorf("listener producer project runtime is required")
	}
	return p.projectState.Snapshot().Document.ProjectByID(projectID)
}

func marshalBinaryDependencyValue(ref binarypayload.ContentRef) (json.RawMessage, error) {
	payload, err := json.Marshal(BinaryDependencyValue{
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

func listenerRealtimeMatchDependenciesForValues(
	deltas []ListenerRealtimeDelta,
	dependencyValues *ListenerRenderedDependencyValues,
) []string {
	dependencySet := map[string]struct{}{}
	for _, delta := range deltas {
		dependency := strings.TrimSpace(delta.Dependency)
		if dependency == "" {
			continue
		}
		dependencySet[dependency] = struct{}{}
	}
	if dependencyValues != nil {
		for _, entry := range dependencyValues.Entries {
			dependency := strings.TrimSpace(entry.DependencyKey)
			if dependency == "" {
				continue
			}
			dependencySet[dependency] = struct{}{}
		}
	}
	dependencies := make([]string, 0, len(dependencySet))
	for dependency := range dependencySet {
		dependencies = append(dependencies, dependency)
	}
	return dependencies
}
