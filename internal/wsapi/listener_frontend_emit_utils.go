package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"setta/internal/artifacts"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

func sendResolvedListenerEmitError(
	ctx context.Context,
	connectionID string,
	err error,
	deps RouteDependencies,
) error {
	for _, resolve := range listenerEmitErrorResolvers {
		if content, ok := resolve(err); ok {
			return sendListenerError(ctx, connectionID, content, deps)
		}
	}

	return sendListenerError(ctx, connectionID, *listenerEmitFailedContent(err.Error()), deps)
}

func listenerEmitUnknownDependencyContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitUnknownDependencyError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_unknown_dependency",
		Details: map[string]any{
			"dependencyName": typed.DependencyName,
		},
	}, true
}

func listenerEmitUnsupportedDependencyContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitUnsupportedDependencyError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_unsupported_dependency",
		Details: map[string]any{
			"dependencyName": typed.DependencyName,
			"reason":         typed.Reason,
		},
	}, true
}

func listenerEmitInvalidValueContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitInvalidValueError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_invalid_value",
		Details: map[string]any{
			"dependencyName": typed.DependencyName,
			"expectedType":   typed.ExpectedType,
		},
	}, true
}

func listenerEmitInvalidArtifactUpdateContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitInvalidArtifactUpdateError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_invalid_artifact_update",
		Details: map[string]any{
			"path":    typed.Path,
			"message": typed.Message,
		},
	}, true
}

func listenerEmitUnsupportedArtifactUpdateContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitUnsupportedArtifactUpdateError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_unsupported_artifact_update",
		Details: map[string]any{
			"path":   typed.Path,
			"reason": typed.Reason,
		},
	}, true
}

func listenerEmitArtifactUpdateFailedContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitArtifactUpdateFailedError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_artifact_update_failed",
		Details: map[string]any{
			"message": typed.Message,
		},
	}, true
}

func decodeJSONString(raw json.RawMessage) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	return value, nil
}

func isJSONObject(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return strings.HasPrefix(trimmed, "{")
}

func cloneJSONRawMessage(raw json.RawMessage) json.RawMessage {
	if raw == nil {
		return nil
	}
	cloned := make(json.RawMessage, len(raw))
	copy(cloned, raw)
	return cloned
}

func cloneRawArtifact(artifact artifacts.RawArtifact) artifacts.RawArtifact {
	cloned := artifact
	cloned.ID = strings.TrimSpace(artifact.ID)
	if artifact.Value == nil {
		cloned.Value = nil
		return cloned
	}
	rawValue := cloneJSONRawMessage(*artifact.Value)
	cloned.Value = &rawValue
	return cloned
}

func cloneJSONObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneJSONValue(value)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneJSONObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneJSONValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func mergeJSONObjects(base map[string]any, overlay map[string]any) map[string]any {
	merged := cloneJSONObject(base)
	for key, value := range overlay {
		merged[key] = cloneJSONValue(value)
	}
	return merged
}

func sectionTypeForPayload(payload map[string]any, impl projectstate.SectionImpl) string {
	if sectionType := listenerPayloadSectionType(payload); sectionType != "" {
		return sectionType
	}
	return listenerFallbackSectionType(impl)
}

func listenerPayloadSectionType(payload map[string]any) string {
	if payload == nil {
		return ""
	}
	rawType, _ := payload["type"].(string)
	return strings.TrimSpace(rawType)
}

func listenerFallbackSectionType(impl projectstate.SectionImpl) string {
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	}
	if sectionType := listenerGeneratedSectionType(impl); sectionType != "" {
		return sectionType
	}
	return strings.TrimSpace(string(impl.Kind))
}

func listenerGeneratedSectionType(impl projectstate.SectionImpl) string {
	if !impl.IsGenerated() {
		return ""
	}
	switch impl.Generated.Kind {
	case projectstate.GeneratedSectionKindPythonCode:
		return "GenPythonCode"
	case projectstate.GeneratedSectionKindPythonMetadata:
		return "GenPythonMetadata"
	case projectstate.GeneratedSectionKindPlugin:
		return "Plugin"
	default:
		return ""
	}
}
