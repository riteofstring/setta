package realtime

import (
	"encoding/json"

	"setta/internal/projectview"
)

type ListenerTemporaryIDStore interface {
	ResolveClientID(string) (string, error)
	EnsureTemporaryID(string) (string, error)
}

func translateListenerMessageToTemporary(message any, store ListenerTemporaryIDStore) (any, error) {
	switch typed := message.(type) {
	case ListenerRealtimeEventMessage:
		content, err := translateListenerRealtimeEventContentToTemporary(typed.Content, store)
		if err != nil {
			return nil, err
		}
		return NewListenerRealtimeEventMessage(content), nil
	case ListenerDependencyEventMessage:
		content, err := translateListenerDependencyEventContentToTemporary(typed.Content, store)
		if err != nil {
			return nil, err
		}
		return NewListenerDependencyEventMessage(content), nil
	case ListenerForceRefreshMessage:
		content, err := translateListenerForceRefreshContentToTemporary(typed.Content, store)
		if err != nil {
			return nil, err
		}
		return NewListenerForceRefreshMessage(content), nil
	default:
		return message, nil
	}
}

func translateListenerRealtimeEventContentToTemporary(
	content ListenerRealtimeEventContent,
	store ListenerTemporaryIDStore,
) (ListenerRealtimeEventContent, error) {
	projectID, err := translateStringValueToTemporary(content.ProjectConfigID, store)
	if err != nil {
		return ListenerRealtimeEventContent{}, err
	}
	deltas := make([]ListenerRealtimeDelta, 0, len(content.Deltas))
	for _, delta := range content.Deltas {
		dependency, err := translateCanonicalListenerDependencyKeyToTemporary(delta.Dependency, store)
		if err != nil {
			return ListenerRealtimeEventContent{}, err
		}
		deltas = append(deltas, ListenerRealtimeDelta{
			Dependency:    dependency,
			Value:         cloneRawMessage(delta.Value),
			BinaryPayload: cloneBytes(delta.BinaryPayload),
		})
	}
	dependencyValues, err := translateListenerRenderedDependencyValuesToTemporary(content.DependencyValues, store)
	if err != nil {
		return ListenerRealtimeEventContent{}, err
	}
	return ListenerRealtimeEventContent{
		ProjectConfigID:  projectID,
		ShareSessionID:   content.ShareSessionID,
		Deltas:           deltas,
		DependencyValues: dependencyValues,
		Sequence:         content.Sequence,
	}, nil
}

func translateListenerDependencyEventContentToTemporary(
	content ListenerDependencyEventContent,
	store ListenerTemporaryIDStore,
) (ListenerDependencyEventContent, error) {
	projectID, err := translateStringValueToTemporary(content.ProjectConfigID, store)
	if err != nil {
		return ListenerDependencyEventContent{}, err
	}
	events := make([]ListenerDependencyEvent, 0, len(content.DependencyEvents))
	for _, event := range content.DependencyEvents {
		dependencyKey, err := translateCanonicalListenerDependencyKeyToTemporary(event.DependencyKey, store)
		if err != nil {
			return ListenerDependencyEventContent{}, err
		}
		events = append(events, ListenerDependencyEvent{
			DependencyKey: dependencyKey,
			Payload:       cloneRawMessage(event.Payload),
			TimestampMS:   event.TimestampMS,
			BinaryPayload: cloneBytes(event.BinaryPayload),
		})
	}
	return ListenerDependencyEventContent{
		ProjectConfigID:  projectID,
		ShareSessionID:   content.ShareSessionID,
		DependencyEvents: events,
		Sequence:         content.Sequence,
	}, nil
}

func translateListenerForceRefreshContentToTemporary(
	content ListenerForceRefreshContent,
	store ListenerTemporaryIDStore,
) (ListenerForceRefreshContent, error) {
	projectID, err := translateStringValueToTemporary(content.ProjectConfigID, store)
	if err != nil {
		return ListenerForceRefreshContent{}, err
	}
	projectState, err := translateListenerProjectStateToTemporary(content.ProjectState, store)
	if err != nil {
		return ListenerForceRefreshContent{}, err
	}
	dependencyCatalog, err := translateListenerDependencyCatalogToTemporary(content.DependencyCatalog, store)
	if err != nil {
		return ListenerForceRefreshContent{}, err
	}
	dependencyValues, err := translateListenerRenderedDependencyValuesToTemporary(content.DependencyValues, store)
	if err != nil {
		return ListenerForceRefreshContent{}, err
	}
	return ListenerForceRefreshContent{
		ProjectConfigID:   projectID,
		ShareSessionID:    content.ShareSessionID,
		CallID:            content.CallID,
		ProjectState:      projectState,
		DependencyCatalog: dependencyCatalog,
		DependencyValues:  dependencyValues,
	}, nil
}

func translateListenerProjectStateToTemporary(raw json.RawMessage, store ListenerTemporaryIDStore) (json.RawMessage, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var view projectview.SingleConfig
	if err := json.Unmarshal(raw, &view); err != nil {
		return nil, err
	}
	projectID, err := translateStringValueToTemporary(view.ProjectConfig.ID, store)
	if err != nil {
		return nil, err
	}
	view.ProjectConfig.ID = projectID
	encoded, err := json.Marshal(view)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func translateListenerDependencyCatalogToTemporary(
	catalog *ListenerDependencyCatalog,
	store ListenerTemporaryIDStore,
) (*ListenerDependencyCatalog, error) {
	if catalog == nil {
		return nil, nil
	}
	entries := make([]ListenerDependencyCatalogEntry, 0, len(catalog.Entries))
	for _, entry := range catalog.Entries {
		dependencyKey, err := translateCanonicalListenerDependencyKeyToTemporary(entry.DependencyKey, store)
		if err != nil {
			return nil, err
		}
		cloned := entry
		cloned.DependencyKey = dependencyKey
		if entry.ControlCodeObjID != "" {
			controlCodeObjID, err := translateStringValueToTemporary(entry.ControlCodeObjID, store)
			if err != nil {
				return nil, err
			}
			cloned.ControlCodeObjID = controlCodeObjID
		}
		if len(entry.Dependencies) > 0 {
			cloned.Dependencies = make([]string, 0, len(entry.Dependencies))
			for _, dependency := range entry.Dependencies {
				translatedDependency, err := translateCanonicalListenerDependencyKeyToTemporary(dependency, store)
				if err != nil {
					return nil, err
				}
				cloned.Dependencies = append(cloned.Dependencies, translatedDependency)
			}
		}
		entries = append(entries, cloned)
	}
	return &ListenerDependencyCatalog{Entries: entries}, nil
}

func translateListenerRenderedDependencyValuesToTemporary(
	values *ListenerRenderedDependencyValues,
	store ListenerTemporaryIDStore,
) (*ListenerRenderedDependencyValues, error) {
	if values == nil {
		return nil, nil
	}
	entries := make([]ListenerRenderedDependencyValue, 0, len(values.Entries))
	for _, entry := range values.Entries {
		dependencyKey, err := translateCanonicalListenerDependencyKeyToTemporary(entry.DependencyKey, store)
		if err != nil {
			return nil, err
		}
		entries = append(entries, ListenerRenderedDependencyValue{
			DependencyKey: dependencyKey,
			RenderedValue: entry.RenderedValue,
		})
	}
	return &ListenerRenderedDependencyValues{Entries: entries}, nil
}

func translateCanonicalListenerDependencyKeyToTemporary(value string, store ListenerTemporaryIDStore) (string, error) {
	key, err := DecodeCanonicalDependencyKey(value)
	if err != nil {
		return "", err
	}
	sectionID, err := translateStringValueToTemporary(key.SectionID, store)
	if err != nil {
		return "", err
	}
	if key.Type == DependencyKeyTypeSection {
		return sectionID, nil
	}
	codeObjID, err := translateStringValueToTemporary(key.CodeObjID, store)
	if err != nil {
		return "", err
	}
	return sectionID + "." + codeObjID, nil
}

func translateStringValueToTemporary(value string, store ListenerTemporaryIDStore) (string, error) {
	if store == nil {
		return value, nil
	}
	return store.EnsureTemporaryID(value)
}
