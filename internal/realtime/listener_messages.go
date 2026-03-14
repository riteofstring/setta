package realtime

import (
	"encoding/json"

	"setta/internal/artifacts"
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
	ProjectConfigID string                  `json:"projectConfigId"`
	ShareSessionID  string                  `json:"shareSessionId,omitempty"`
	Deltas          []ListenerRealtimeDelta `json:"deltas"`
	Sequence        uint64                  `json:"sequence"`
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
	DependencyKey              string `json:"dependencyKey"`
	FullPathName               string `json:"fullPathName"`
	SectionType                string `json:"sectionType,omitempty"`
	CodeObjType                string `json:"codeObjType,omitempty"`
	ControlCodeObjID           string `json:"controlCodeObjId,omitempty"`
	ControlCodeObjType         string `json:"controlCodeObjType,omitempty"`
	SectionRepresentation      string `json:"sectionRepresentation,omitempty"`
	ControlValueRepresentation string `json:"controlValueRepresentation,omitempty"`
	ValueRepresentation        string `json:"valueRepresentation,omitempty"`
}

type ListenerRenderedDependencyValues struct {
	Entries []ListenerRenderedDependencyValue `json:"entries"`
}

type ListenerRenderedDependencyValue struct {
	DependencyKey string `json:"dependencyKey"`
	RenderedValue string `json:"renderedValue"`
}

type ListenerForceRefreshContent struct {
	ProjectConfigID   string                            `json:"projectConfigId"`
	ShareSessionID    string                            `json:"shareSessionId,omitempty"`
	CallID            string                            `json:"callId,omitempty"`
	ProjectState      json.RawMessage                   `json:"projectState,omitempty"`
	DependencyCatalog *ListenerDependencyCatalog        `json:"dependencyCatalog,omitempty"`
	DependencyValues  *ListenerRenderedDependencyValues `json:"dependencyValues,omitempty"`
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
		DependencyKey              json.RawMessage `json:"dependencyKey"`
		FullPathName               string          `json:"fullPathName"`
		SectionType                string          `json:"sectionType,omitempty"`
		CodeObjType                string          `json:"codeObjType,omitempty"`
		ControlCodeObjID           string          `json:"controlCodeObjId,omitempty"`
		ControlCodeObjType         string          `json:"controlCodeObjType,omitempty"`
		SectionRepresentation      string          `json:"sectionRepresentation,omitempty"`
		ControlValueRepresentation string          `json:"controlValueRepresentation,omitempty"`
		ValueRepresentation        string          `json:"valueRepresentation,omitempty"`
	}
	payload.DependencyKey = dependencyKey
	payload.FullPathName = e.FullPathName
	payload.SectionType = e.SectionType
	payload.CodeObjType = e.CodeObjType
	payload.ControlCodeObjID = e.ControlCodeObjID
	payload.ControlCodeObjType = e.ControlCodeObjType
	payload.SectionRepresentation = e.SectionRepresentation
	payload.ControlValueRepresentation = e.ControlValueRepresentation
	payload.ValueRepresentation = e.ValueRepresentation
	return json.Marshal(payload)
}

func (e *ListenerDependencyCatalogEntry) UnmarshalJSON(data []byte) error {
	var payload struct {
		DependencyKey              json.RawMessage `json:"dependencyKey"`
		FullPathName               string          `json:"fullPathName"`
		SectionType                string          `json:"sectionType,omitempty"`
		CodeObjType                string          `json:"codeObjType,omitempty"`
		ControlCodeObjID           string          `json:"controlCodeObjId,omitempty"`
		ControlCodeObjType         string          `json:"controlCodeObjType,omitempty"`
		SectionRepresentation      string          `json:"sectionRepresentation,omitempty"`
		ControlValueRepresentation string          `json:"controlValueRepresentation,omitempty"`
		ValueRepresentation        string          `json:"valueRepresentation,omitempty"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	dependencyKey, err := canonicalDependencyKeyFromWire(payload.DependencyKey)
	if err != nil {
		return err
	}

	e.DependencyKey = dependencyKey
	e.FullPathName = payload.FullPathName
	e.SectionType = payload.SectionType
	e.CodeObjType = payload.CodeObjType
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
