package realtime

import (
	"encoding/json"
	"fmt"

	"setta/internal/artifacts"
	"setta/internal/pythonsdkcontracts"
)

const (
	MessageTypeListenerInit            = "ListenerInit"
	MessageTypeListenerRegister        = "ListenerRegister"
	MessageTypeListenerRegisterAck     = "ListenerRegisterAck"
	MessageTypeListenerFrontendEmit    = "ListenerFrontendEmit"
	MessageTypeListenerRouterCall      = "ListenerRouterEndpointCall"
	MessageTypeListenerRouterResult    = "ListenerRouterEndpointResult"
	MessageTypeListenerRealtimeEvent   = "ListenerRealtimeEvent"
	MessageTypeListenerDependencyEvent = "ListenerDependencyEvent"
	MessageTypeListenerForceRefresh    = "ListenerForceRefresh"
	MessageTypeListenerError           = "ListenerError"
)

type ListenerInitContent struct {
	ProjectConfigID string `json:"projectConfigId,omitempty"`
	ProjectName     string `json:"projectName,omitempty"`
	UseTemporaryIDs bool   `json:"useTemporaryIds,omitempty"`
}

type ListenerInitMessage struct {
	MessageType string              `json:"messageType"`
	Content     ListenerInitContent `json:"content"`
}

type ListenerErrorContent struct {
	Error   string         `json:"error"`
	Details map[string]any `json:"details,omitempty"`
}

type ListenerErrorMessage struct {
	MessageType string               `json:"messageType"`
	Content     ListenerErrorContent `json:"content"`
}

type ListenerRealtimeDelta struct {
	Dependency    string          `json:"dependency"`
	Value         json.RawMessage `json:"value"`
	BinaryPayload []byte          `json:"-"`
}

type ListenerRegisterCallbackSpec struct {
	Dependencies   []string               `json:"dependencies"`
	DependencyMode ListenerDependencyMode `json:"dependencyMode"`
}

type ListenerRegisterContent struct {
	ProjectConfigID string                                  `json:"projectConfigId,omitempty"`
	Callbacks       map[string]ListenerRegisterCallbackSpec `json:"callbacks"`
}

type ListenerRegisterMessage struct {
	MessageType string                  `json:"messageType"`
	Content     ListenerRegisterContent `json:"content"`
}

type ListenerFrontendEmitContent struct {
	ProjectConfigID  string                     `json:"projectConfigId"`
	DependencyValues map[string]json.RawMessage `json:"dependencyValues,omitempty"`
	ArtifactUpdates  []artifacts.RawArtifact    `json:"artifactUpdates,omitempty"`
}

type ListenerFrontendEmitMessage struct {
	MessageType string                      `json:"messageType"`
	Content     ListenerFrontendEmitContent `json:"content"`
}

type ListenerRegisterAckStatus struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type ListenerRegisterAckContent struct {
	ProjectConfigID string                               `json:"projectConfigId"`
	ShareSessionID  string                               `json:"shareSessionId,omitempty"`
	Callbacks       map[string]ListenerRegisterAckStatus `json:"callbacks"`
}

type ListenerRegisterAckMessage struct {
	MessageType string                     `json:"messageType"`
	Content     ListenerRegisterAckContent `json:"content"`
}

type ListenerRouterEndpointCallContent struct {
	ProjectConfigID string         `json:"projectConfigId"`
	CallID          string         `json:"callId"`
	EndpointName    string         `json:"endpointName"`
	Payload         map[string]any `json:"payload"`
}

type ListenerRouterEndpointCallMessage struct {
	MessageType string                            `json:"messageType"`
	Content     ListenerRouterEndpointCallContent `json:"content"`
}

type ListenerRouterEndpointResultContent struct {
	ProjectConfigID string         `json:"projectConfigId"`
	CallID          string         `json:"callId"`
	OK              bool           `json:"ok"`
	Result          any            `json:"result,omitempty"`
	Error           string         `json:"error,omitempty"`
	Details         map[string]any `json:"details,omitempty"`
}

type ListenerRouterEndpointResultMessage struct {
	MessageType string                              `json:"messageType"`
	Content     ListenerRouterEndpointResultContent `json:"content"`
}

type ListenerDependencyEvent struct {
	DependencyKey string          `json:"dependencyKey"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	TimestampMS   int64           `json:"timestampMs"`
	BinaryPayload []byte          `json:"-"`
}

type ListenerRealtimeEventContent struct {
	ProjectConfigID  string                            `json:"projectConfigId"`
	ShareSessionID   string                            `json:"shareSessionId,omitempty"`
	Deltas           []ListenerRealtimeDelta           `json:"deltas"`
	DependencyValues *ListenerRenderedDependencyValues `json:"dependencyValues,omitempty"`
	Sequence         uint64                            `json:"sequence"`
}

type ListenerRealtimeEventMessage struct {
	MessageType string                       `json:"messageType"`
	Content     ListenerRealtimeEventContent `json:"content"`
}

type ListenerDependencyEventContent struct {
	ProjectConfigID  string                    `json:"projectConfigId"`
	ShareSessionID   string                    `json:"shareSessionId,omitempty"`
	DependencyEvents []ListenerDependencyEvent `json:"dependencyEvents"`
	Sequence         uint64                    `json:"sequence"`
}

type ListenerDependencyEventMessage struct {
	MessageType string                         `json:"messageType"`
	Content     ListenerDependencyEventContent `json:"content"`
}

type ListenerDependencyCatalog struct {
	Entries []ListenerDependencyCatalogEntry `json:"entries"`
}

type ListenerDependencyCatalogEntry struct {
	DependencyKey              string   `json:"dependencyKey"`
	Name                       string   `json:"name"`
	FullPathName               string   `json:"fullPathName"`
	Dependencies               []string `json:"dependencies,omitempty"`
	IncludeInCodegen           bool     `json:"includeInCodegen"`
	SectionType                string   `json:"sectionType,omitempty"`
	CodeObjType                string   `json:"codeObjType,omitempty"`
	PassingStyle               string   `json:"passingStyle,omitempty"`
	ControlCodeObjID           string   `json:"controlCodeObjId,omitempty"`
	ControlCodeObjType         string   `json:"controlCodeObjType,omitempty"`
	SectionRepresentation      string   `json:"sectionRepresentation,omitempty"`
	ControlValueRepresentation string   `json:"controlValueRepresentation,omitempty"`
	ValueRepresentation        string   `json:"valueRepresentation,omitempty"`
}

type ListenerRenderedDependencyValues struct {
	Entries []ListenerRenderedDependencyValue `json:"entries"`
}

type ListenerRenderedDependencyValue struct {
	DependencyKey string `json:"dependencyKey"`
	RenderedValue string `json:"renderedValue"`
}

type ListenerForceRefreshContent struct {
	CallID      string                              `json:"callId,omitempty"`
	Snapshot    pythonsdkcontracts.ListenerSnapshot `json:"snapshot"`
	Sequence    *uint64                             `json:"sequence,omitempty"`
	RefreshKind string                              `json:"refreshKind,omitempty"`
}

type ListenerForceRefreshMessage struct {
	MessageType string                      `json:"messageType"`
	Content     ListenerForceRefreshContent `json:"content"`
}

func (s *ListenerRegisterCallbackSpec) UnmarshalJSON(data []byte) error {
	var raw struct {
		Dependencies   []json.RawMessage      `json:"dependencies"`
		DependencyMode ListenerDependencyMode `json:"dependencyMode"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	dependencies := make([]string, 0, len(raw.Dependencies))
	for _, dependency := range raw.Dependencies {
		canonical, err := canonicalDependencyKeyFromWire(dependency)
		if err != nil {
			return err
		}
		dependencies = append(dependencies, canonical)
	}

	s.Dependencies = dependencies
	s.DependencyMode = raw.DependencyMode
	return nil
}

func (d ListenerRealtimeDelta) MarshalJSON() ([]byte, error) {
	dependency, err := structuredDependencyKeyJSON(d.Dependency)
	if err != nil {
		return nil, err
	}

	var payload struct {
		Dependency json.RawMessage `json:"dependency"`
		Value      json.RawMessage `json:"value"`
	}
	payload.Dependency = dependency
	payload.Value = d.Value
	return json.Marshal(payload)
}

func (d *ListenerRealtimeDelta) UnmarshalJSON(data []byte) error {
	var payload struct {
		Dependency json.RawMessage `json:"dependency"`
		Value      json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	dependency, err := canonicalDependencyKeyFromWire(payload.Dependency)
	if err != nil {
		return err
	}

	d.Dependency = dependency
	d.Value = payload.Value
	return nil
}

func (e ListenerDependencyEvent) MarshalJSON() ([]byte, error) {
	dependencyKey, err := structuredDependencyKeyJSON(e.DependencyKey)
	if err != nil {
		return nil, err
	}

	var payload struct {
		DependencyKey json.RawMessage `json:"dependencyKey"`
		Payload       json.RawMessage `json:"payload,omitempty"`
		TimestampMS   int64           `json:"timestampMs"`
	}
	payload.DependencyKey = dependencyKey
	payload.Payload = e.Payload
	payload.TimestampMS = e.TimestampMS
	return json.Marshal(payload)
}

func (e *ListenerDependencyEvent) UnmarshalJSON(data []byte) error {
	var payload struct {
		DependencyKey json.RawMessage `json:"dependencyKey"`
		Payload       json.RawMessage `json:"payload,omitempty"`
		TimestampMS   int64           `json:"timestampMs"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	dependencyKey, err := canonicalDependencyKeyFromWire(payload.DependencyKey)
	if err != nil {
		return err
	}

	e.DependencyKey = dependencyKey
	e.Payload = payload.Payload
	e.TimestampMS = payload.TimestampMS
	return nil
}

func (e ListenerDependencyCatalogEntry) MarshalJSON() ([]byte, error) {
	dependencyKey, err := structuredDependencyKeyJSON(e.DependencyKey)
	if err != nil {
		return nil, err
	}

	var payload struct {
		DependencyKey              json.RawMessage   `json:"dependencyKey"`
		Name                       string            `json:"name"`
		FullPathName               string            `json:"fullPathName"`
		Dependencies               []json.RawMessage `json:"dependencies,omitempty"`
		IncludeInCodegen           bool              `json:"includeInCodegen"`
		SectionType                string            `json:"sectionType,omitempty"`
		CodeObjType                string            `json:"codeObjType,omitempty"`
		PassingStyle               string            `json:"passingStyle,omitempty"`
		ControlCodeObjID           string            `json:"controlCodeObjId,omitempty"`
		ControlCodeObjType         string            `json:"controlCodeObjType,omitempty"`
		SectionRepresentation      string            `json:"sectionRepresentation,omitempty"`
		ControlValueRepresentation string            `json:"controlValueRepresentation,omitempty"`
		ValueRepresentation        string            `json:"valueRepresentation,omitempty"`
	}
	dependencies, err := structuredDependencyKeysJSON(e.Dependencies)
	if err != nil {
		return nil, err
	}
	payload.DependencyKey = dependencyKey
	payload.Name = e.Name
	payload.FullPathName = e.FullPathName
	payload.Dependencies = dependencies
	payload.IncludeInCodegen = e.IncludeInCodegen
	payload.SectionType = e.SectionType
	payload.CodeObjType = e.CodeObjType
	payload.PassingStyle = e.PassingStyle
	payload.ControlCodeObjID = e.ControlCodeObjID
	payload.ControlCodeObjType = e.ControlCodeObjType
	payload.SectionRepresentation = e.SectionRepresentation
	payload.ControlValueRepresentation = e.ControlValueRepresentation
	payload.ValueRepresentation = e.ValueRepresentation
	return json.Marshal(payload)
}

func (e *ListenerDependencyCatalogEntry) UnmarshalJSON(data []byte) error {
	var payload struct {
		DependencyKey              json.RawMessage   `json:"dependencyKey"`
		Name                       string            `json:"name"`
		FullPathName               string            `json:"fullPathName"`
		Dependencies               []json.RawMessage `json:"dependencies,omitempty"`
		IncludeInCodegen           bool              `json:"includeInCodegen"`
		SectionType                string            `json:"sectionType,omitempty"`
		CodeObjType                string            `json:"codeObjType,omitempty"`
		PassingStyle               string            `json:"passingStyle,omitempty"`
		ControlCodeObjID           string            `json:"controlCodeObjId,omitempty"`
		ControlCodeObjType         string            `json:"controlCodeObjType,omitempty"`
		SectionRepresentation      string            `json:"sectionRepresentation,omitempty"`
		ControlValueRepresentation string            `json:"controlValueRepresentation,omitempty"`
		ValueRepresentation        string            `json:"valueRepresentation,omitempty"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	dependencyKey, err := canonicalDependencyKeyFromWire(payload.DependencyKey)
	if err != nil {
		return err
	}
	dependencies := make([]string, 0, len(payload.Dependencies))
	for _, dependency := range payload.Dependencies {
		canonical, err := canonicalDependencyKeyFromWire(dependency)
		if err != nil {
			return err
		}
		dependencies = append(dependencies, canonical)
	}

	e.DependencyKey = dependencyKey
	e.Name = payload.Name
	e.FullPathName = payload.FullPathName
	e.Dependencies = dependencies
	e.IncludeInCodegen = payload.IncludeInCodegen
	e.SectionType = payload.SectionType
	e.CodeObjType = payload.CodeObjType
	e.PassingStyle = payload.PassingStyle
	e.ControlCodeObjID = payload.ControlCodeObjID
	e.ControlCodeObjType = payload.ControlCodeObjType
	e.SectionRepresentation = payload.SectionRepresentation
	e.ControlValueRepresentation = payload.ControlValueRepresentation
	e.ValueRepresentation = payload.ValueRepresentation
	return nil
}

func (e ListenerRenderedDependencyValue) MarshalJSON() ([]byte, error) {
	dependencyKey, err := structuredDependencyKeyJSON(e.DependencyKey)
	if err != nil {
		return nil, err
	}

	var payload struct {
		DependencyKey json.RawMessage `json:"dependencyKey"`
		RenderedValue string          `json:"renderedValue"`
	}
	payload.DependencyKey = dependencyKey
	payload.RenderedValue = e.RenderedValue
	return json.Marshal(payload)
}

func (e *ListenerRenderedDependencyValue) UnmarshalJSON(data []byte) error {
	var payload struct {
		DependencyKey json.RawMessage `json:"dependencyKey"`
		RenderedValue string          `json:"renderedValue"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	dependencyKey, err := canonicalDependencyKeyFromWire(payload.DependencyKey)
	if err != nil {
		return err
	}

	e.DependencyKey = dependencyKey
	e.RenderedValue = payload.RenderedValue
	return nil
}

func (c ListenerForceRefreshContent) MarshalJSON() ([]byte, error) {
	snapshotPayload, err := marshalListenerSnapshotToWire(c.Snapshot)
	if err != nil {
		return nil, err
	}

	var payload struct {
		CallID      string          `json:"callId,omitempty"`
		Snapshot    json.RawMessage `json:"snapshot"`
		Sequence    *uint64         `json:"sequence,omitempty"`
		RefreshKind string          `json:"refreshKind,omitempty"`
	}
	payload.CallID = c.CallID
	payload.Snapshot = snapshotPayload
	payload.Sequence = c.Sequence
	payload.RefreshKind = c.RefreshKind
	return json.Marshal(payload)
}

func (c *ListenerForceRefreshContent) UnmarshalJSON(data []byte) error {
	var payload struct {
		CallID      string          `json:"callId,omitempty"`
		Snapshot    json.RawMessage `json:"snapshot"`
		Sequence    *uint64         `json:"sequence,omitempty"`
		RefreshKind string          `json:"refreshKind,omitempty"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}
	if len(payload.Snapshot) == 0 {
		return fmt.Errorf("listener force refresh snapshot is required")
	}
	snapshot, err := unmarshalListenerSnapshotFromWire(payload.Snapshot)
	if err != nil {
		return err
	}
	c.CallID = payload.CallID
	c.Snapshot = snapshot
	c.Sequence = payload.Sequence
	c.RefreshKind = payload.RefreshKind
	return nil
}

func marshalListenerSnapshotToWire(snapshot pythonsdkcontracts.ListenerSnapshot) (json.RawMessage, error) {
	var payload struct {
		ProjectConfigID   string                           `json:"projectConfigId"`
		ShareSessionID    *string                          `json:"shareSessionId,omitempty"`
		DependencyCatalog ListenerDependencyCatalog        `json:"dependencyCatalog"`
		DependencyValues  ListenerRenderedDependencyValues `json:"dependencyValues"`
	}
	payload.ProjectConfigID = snapshot.ProjectConfigID
	payload.ShareSessionID = snapshot.ShareSessionID
	payload.DependencyCatalog = realtimeListenerDependencyCatalogFromContract(snapshot.DependencyCatalog)
	payload.DependencyValues = realtimeListenerRenderedDependencyValuesFromContract(snapshot.DependencyValues)
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func unmarshalListenerSnapshotFromWire(data json.RawMessage) (pythonsdkcontracts.ListenerSnapshot, error) {
	var payload struct {
		ProjectConfigID   string                           `json:"projectConfigId"`
		ShareSessionID    *string                          `json:"shareSessionId,omitempty"`
		DependencyCatalog ListenerDependencyCatalog        `json:"dependencyCatalog"`
		DependencyValues  ListenerRenderedDependencyValues `json:"dependencyValues"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return pythonsdkcontracts.ListenerSnapshot{}, err
	}
	return pythonsdkcontracts.ListenerSnapshot{
		ProjectConfigID:   payload.ProjectConfigID,
		ShareSessionID:    payload.ShareSessionID,
		DependencyCatalog: contractListenerDependencyCatalogFromRealtime(payload.DependencyCatalog),
		DependencyValues:  contractListenerRenderedDependencyValuesFromRealtime(payload.DependencyValues),
	}, nil
}

func realtimeListenerDependencyCatalogFromContract(catalog pythonsdkcontracts.ListenerDependencyCatalog) ListenerDependencyCatalog {
	entries := make([]ListenerDependencyCatalogEntry, 0, len(catalog.Entries))
	for _, entry := range catalog.Entries {
		entries = append(entries, ListenerDependencyCatalogEntry{
			DependencyKey:              entry.DependencyKey,
			Name:                       entry.Name,
			FullPathName:               entry.FullPathName,
			Dependencies:               append([]string(nil), entry.Dependencies...),
			IncludeInCodegen:           entry.IncludeInCodegen,
			SectionType:                stringValue(entry.SectionType),
			CodeObjType:                stringValue(entry.CodeObjType),
			PassingStyle:               stringValue(entry.PassingStyle),
			ControlCodeObjID:           stringValue(entry.ControlCodeObjID),
			ControlCodeObjType:         stringValue(entry.ControlCodeObjType),
			SectionRepresentation:      stringValue(entry.SectionRepresentation),
			ControlValueRepresentation: stringValue(entry.ControlValueRepresentation),
			ValueRepresentation:        stringValue(entry.ValueRepresentation),
		})
	}
	return ListenerDependencyCatalog{Entries: entries}
}

func contractListenerDependencyCatalogFromRealtime(catalog ListenerDependencyCatalog) pythonsdkcontracts.ListenerDependencyCatalog {
	entries := make([]pythonsdkcontracts.ListenerDependencyCatalogEntry, 0, len(catalog.Entries))
	for _, entry := range catalog.Entries {
		entries = append(entries, pythonsdkcontracts.ListenerDependencyCatalogEntry{
			DependencyKey:              entry.DependencyKey,
			Name:                       entry.Name,
			FullPathName:               entry.FullPathName,
			Dependencies:               append([]string(nil), entry.Dependencies...),
			IncludeInCodegen:           entry.IncludeInCodegen,
			SectionType:                stringPointer(entry.SectionType),
			CodeObjType:                stringPointer(entry.CodeObjType),
			PassingStyle:               stringPointer(entry.PassingStyle),
			ControlCodeObjID:           stringPointer(entry.ControlCodeObjID),
			ControlCodeObjType:         stringPointer(entry.ControlCodeObjType),
			SectionRepresentation:      stringPointer(entry.SectionRepresentation),
			ControlValueRepresentation: stringPointer(entry.ControlValueRepresentation),
			ValueRepresentation:        stringPointer(entry.ValueRepresentation),
		})
	}
	return pythonsdkcontracts.ListenerDependencyCatalog{Entries: entries}
}

func realtimeListenerRenderedDependencyValuesFromContract(values pythonsdkcontracts.ListenerRenderedDependencyValues) ListenerRenderedDependencyValues {
	entries := make([]ListenerRenderedDependencyValue, 0, len(values.Entries))
	for _, entry := range values.Entries {
		entries = append(entries, ListenerRenderedDependencyValue{
			DependencyKey: entry.DependencyKey,
			RenderedValue: entry.RenderedValue,
		})
	}
	return ListenerRenderedDependencyValues{Entries: entries}
}

func contractListenerRenderedDependencyValuesFromRealtime(values ListenerRenderedDependencyValues) pythonsdkcontracts.ListenerRenderedDependencyValues {
	entries := make([]pythonsdkcontracts.ListenerRenderedDependencyValue, 0, len(values.Entries))
	for _, entry := range values.Entries {
		entries = append(entries, pythonsdkcontracts.ListenerRenderedDependencyValue{
			DependencyKey: entry.DependencyKey,
			RenderedValue: entry.RenderedValue,
		})
	}
	return pythonsdkcontracts.ListenerRenderedDependencyValues{Entries: entries}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func stringPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func NewListenerRealtimeEventMessage(content ListenerRealtimeEventContent) ListenerRealtimeEventMessage {
	return ListenerRealtimeEventMessage{
		MessageType: MessageTypeListenerRealtimeEvent,
		Content:     content,
	}
}

func NewListenerErrorMessage(content ListenerErrorContent) ListenerErrorMessage {
	return ListenerErrorMessage{
		MessageType: MessageTypeListenerError,
		Content:     content,
	}
}

func NewListenerRegisterAckMessage(content ListenerRegisterAckContent) ListenerRegisterAckMessage {
	return ListenerRegisterAckMessage{
		MessageType: MessageTypeListenerRegisterAck,
		Content:     content,
	}
}

func NewListenerRouterEndpointResultMessage(content ListenerRouterEndpointResultContent) ListenerRouterEndpointResultMessage {
	return ListenerRouterEndpointResultMessage{
		MessageType: MessageTypeListenerRouterResult,
		Content:     content,
	}
}

func NewListenerDependencyEventMessage(content ListenerDependencyEventContent) ListenerDependencyEventMessage {
	return ListenerDependencyEventMessage{
		MessageType: MessageTypeListenerDependencyEvent,
		Content:     content,
	}
}

func NewListenerForceRefreshMessage(content ListenerForceRefreshContent) ListenerForceRefreshMessage {
	return ListenerForceRefreshMessage{
		MessageType: MessageTypeListenerForceRefresh,
		Content:     content,
	}
}
