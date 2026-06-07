package semanticgraph

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

func validateSemanticEventForAppend(event SemanticEvent) error {
	if err := validateSemanticEventIdentity(event); err != nil {
		return err
	}
	if event.LogicalClock < 0 {
		return fmt.Errorf("semantic event %s logicalClock must not be negative", event.EventID)
	}
	return validateSemanticEventCommon(event)
}

func validateSemanticEventRecord(event SemanticEvent) error {
	if err := validateSemanticEventIdentity(event); err != nil {
		return err
	}
	if event.LogicalClock <= 0 {
		return fmt.Errorf("semantic event %s logicalClock must be positive", event.EventID)
	}
	return validateSemanticEventCommon(event)
}

func validateSemanticEventIdentity(event SemanticEvent) error {
	if err := validateStoreIDs("event id", event.EventID, "workspace id", event.WorkspaceID); err != nil {
		return err
	}
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: "session id", value: event.SessionID},
		{label: "run id", value: event.RunID},
		{label: "workflow execution id", value: event.WorkflowExecutionID},
		{label: "actor id", value: event.ActorID},
		{label: "target entity id", value: event.TargetEntityID},
		{label: "causation id", value: event.CausationID},
		{label: "correlation id", value: event.CorrelationID},
		{label: "supersedes event id", value: event.SupersedesEventID},
		{label: "retracted by event id", value: event.RetractedByEventID},
	})
}

type optionalStoreID struct {
	label string
	value string
}

func validateOptionalStoreIDs(values []optionalStoreID) error {
	for _, item := range values {
		if item.value == "" {
			continue
		}
		if err := validateStoreIDs(item.label, item.value); err != nil {
			return err
		}
	}
	return nil
}

func validateSemanticEventCommon(event SemanticEvent) error {
	if !isSemanticActorKind(event.ActorKind) {
		return fmt.Errorf("semantic event %s actorKind is unsupported: %s", event.EventID, event.ActorKind)
	}
	if !isSemanticEventType(event.EventType) {
		return fmt.Errorf("semantic event %s eventType is unsupported: %s", event.EventID, event.EventType)
	}
	if event.ObservedAt == "" {
		return fmt.Errorf("semantic event %s observedAt is required", event.EventID)
	}
	if err := validateTimestamp("observedAt", event.ObservedAt); err != nil {
		return fmt.Errorf("semantic event %s: %w", event.EventID, err)
	}
	if len(event.Payload) == 0 {
		return fmt.Errorf("semantic event %s payload is required", event.EventID)
	}
	if event.ModelInfo == nil {
		return fmt.Errorf("semantic event %s modelInfo must not be null", event.EventID)
	}
	if event.Confidence != nil && (*event.Confidence < 0 || *event.Confidence > 100) {
		return fmt.Errorf("semantic event %s confidence must be between 0 and 100", event.EventID)
	}
	return nil
}

func validateStoreIDs(pairs ...string) error {
	if len(pairs)%2 != 0 {
		return errors.New("validateStoreIDs requires label/value pairs")
	}
	for index := 0; index < len(pairs); index += 2 {
		if err := validateStorageID(pairs[index], pairs[index+1]); err != nil {
			return err
		}
	}
	return nil
}

func validateStorageID(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if !isStorageID(value) {
		return fmt.Errorf("%s %q must contain only letters, numbers, underscores, or hyphens", label, value)
	}
	return nil
}

func isStorageID(value string) bool {
	for _, char := range value {
		if char >= 'a' && char <= 'z' {
			continue
		}
		if char >= 'A' && char <= 'Z' {
			continue
		}
		if char >= '0' && char <= '9' {
			continue
		}
		if char == '_' || char == '-' {
			continue
		}
		return false
	}
	return value != ""
}

func validateTimestamp(label string, value string) error {
	if _, err := time.Parse(time.RFC3339Nano, value); err != nil {
		return fmt.Errorf("%s must be an RFC3339 timestamp: %w", label, err)
	}
	return nil
}

func compactRawJSON(raw json.RawMessage, defaultJSON string) (json.RawMessage, string, error) {
	if len(raw) == 0 {
		return json.RawMessage(defaultJSON), defaultJSON, nil
	}
	var buffer bytes.Buffer
	if err := json.Compact(&buffer, raw); err != nil {
		return nil, "", err
	}
	return json.RawMessage(buffer.Bytes()), buffer.String(), nil
}

func marshalJSONColumn(value any) (string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func rawJSONFromString(value string) json.RawMessage {
	if value == "" {
		return json.RawMessage("{}")
	}
	return json.RawMessage(value)
}

func decodeStrictPayload[T any](event SemanticEvent) (T, error) {
	var payload T
	decoder := json.NewDecoder(bytes.NewReader(event.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return payload, fmt.Errorf("decode %s payload: %w", event.EventType, err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return payload, fmt.Errorf("decode %s payload: trailing JSON value", event.EventType)
		}
		return payload, fmt.Errorf("decode %s payload trailing JSON: %w", event.EventType, err)
	}
	return payload, nil
}

func requireEntityID(event SemanticEvent, payloadEntityID string, label string) error {
	if err := validateStoreIDs(label, payloadEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payloadEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payloadEntityID)
	}
	return nil
}

func requireOptionalEntityID(value string, label string) error {
	if value == "" {
		return nil
	}
	return validateStoreIDs(label, value)
}

func requireNonEmpty(value string, label string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	return nil
}

func isSemanticNodeKind(kind SemanticNodeKind) bool {
	for _, value := range semanticNodeKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticEdgeKind(kind SemanticEdgeKind) bool {
	for _, value := range semanticEdgeKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticActivityKind(kind SemanticActivityKind) bool {
	for _, value := range semanticActivityKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticActivitySourceKind(kind SemanticActivitySourceKind) bool {
	for _, value := range semanticActivitySourceKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticEventType(eventType SemanticEventType) bool {
	for _, value := range semanticEventTypeValues {
		if eventType == value {
			return true
		}
	}
	return false
}

func isSemanticActorKind(kind SemanticActorKind) bool {
	for _, value := range semanticActorKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticEvidenceSourceKind(kind SemanticEvidenceSourceKind) bool {
	for _, value := range semanticEvidenceSourceKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticSteeringKind(kind SemanticSteeringKind) bool {
	for _, value := range semanticSteeringKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func isSemanticSteeringStatus(status SemanticSteeringStatus) bool {
	for _, value := range semanticSteeringStatusValues {
		if status == value {
			return true
		}
	}
	return false
}

func isSemanticSteeringScope(scope SemanticSteeringScope) bool {
	for _, value := range semanticSteeringScopeValues {
		if scope == value {
			return true
		}
	}
	return false
}

func boolFromInt(value int) bool {
	return value != 0
}

func intFromBool(value bool) int {
	if value {
		return 1
	}
	return 0
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
