package realtime

import (
	"setta/internal/pythonsdkcontracts"
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
	snapshot, err := translateListenerSnapshotToTemporary(content.Snapshot, store)
	if err != nil {
		return ListenerForceRefreshContent{}, err
	}
	return ListenerForceRefreshContent{
		CallID:      content.CallID,
		Snapshot:    snapshot,
		Sequence:    content.Sequence,
		RefreshKind: content.RefreshKind,
	}, nil
}

func translateListenerSnapshotToTemporary(
	snapshot pythonsdkcontracts.ListenerSnapshot,
	store ListenerTemporaryIDStore,
) (pythonsdkcontracts.ListenerSnapshot, error) {
	projectID, err := translateStringValueToTemporary(snapshot.ProjectConfigID, store)
	if err != nil {
		return pythonsdkcontracts.ListenerSnapshot{}, err
	}
	dependencyCatalog, err := translateContractListenerDependencyCatalogToTemporary(snapshot.DependencyCatalog, store)
	if err != nil {
		return pythonsdkcontracts.ListenerSnapshot{}, err
	}
	dependencyValues, err := translateContractListenerRenderedDependencyValuesToTemporary(snapshot.DependencyValues, store)
	if err != nil {
		return pythonsdkcontracts.ListenerSnapshot{}, err
	}
	return pythonsdkcontracts.ListenerSnapshot{
		ProjectConfigID:   projectID,
		ShareSessionID:    snapshot.ShareSessionID,
		DependencyCatalog: dependencyCatalog,
		DependencyValues:  dependencyValues,
	}, nil
}

func translateContractListenerDependencyCatalogToTemporary(
	catalog pythonsdkcontracts.ListenerDependencyCatalog,
	store ListenerTemporaryIDStore,
) (pythonsdkcontracts.ListenerDependencyCatalog, error) {
	entries := make([]pythonsdkcontracts.ListenerDependencyCatalogEntry, 0, len(catalog.Entries))
	for _, entry := range catalog.Entries {
		dependencyKey, err := translateCanonicalListenerDependencyKeyToTemporary(entry.DependencyKey, store)
		if err != nil {
			return pythonsdkcontracts.ListenerDependencyCatalog{}, err
		}
		cloned := entry
		cloned.DependencyKey = dependencyKey
		if entry.ControlCodeObjID != nil && *entry.ControlCodeObjID != "" {
			controlCodeObjID, err := translateStringValueToTemporary(*entry.ControlCodeObjID, store)
			if err != nil {
				return pythonsdkcontracts.ListenerDependencyCatalog{}, err
			}
			cloned.ControlCodeObjID = &controlCodeObjID
		}
		if len(entry.Dependencies) > 0 {
			cloned.Dependencies = make([]string, 0, len(entry.Dependencies))
			for _, dependency := range entry.Dependencies {
				translatedDependency, err := translateCanonicalListenerDependencyKeyToTemporary(dependency, store)
				if err != nil {
					return pythonsdkcontracts.ListenerDependencyCatalog{}, err
				}
				cloned.Dependencies = append(cloned.Dependencies, translatedDependency)
			}
		}
		entries = append(entries, cloned)
	}
	return pythonsdkcontracts.ListenerDependencyCatalog{Entries: entries}, nil
}

func translateContractListenerRenderedDependencyValuesToTemporary(
	values pythonsdkcontracts.ListenerRenderedDependencyValues,
	store ListenerTemporaryIDStore,
) (pythonsdkcontracts.ListenerRenderedDependencyValues, error) {
	entries := make([]pythonsdkcontracts.ListenerRenderedDependencyValue, 0, len(values.Entries))
	for _, entry := range values.Entries {
		dependencyKey, err := translateCanonicalListenerDependencyKeyToTemporary(entry.DependencyKey, store)
		if err != nil {
			return pythonsdkcontracts.ListenerRenderedDependencyValues{}, err
		}
		entries = append(entries, pythonsdkcontracts.ListenerRenderedDependencyValue{
			DependencyKey: dependencyKey,
			RenderedValue: entry.RenderedValue,
		})
	}
	return pythonsdkcontracts.ListenerRenderedDependencyValues{Entries: entries}, nil
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
