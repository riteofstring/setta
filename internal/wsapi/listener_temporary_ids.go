package wsapi

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/mcpx"
	"setta/internal/realtime"
)

type listenerTemporaryIDError struct {
	message string
}

func (e *listenerTemporaryIDError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func listenerUsesTemporaryIDs(deps RouteDependencies, connectionID string) bool {
	bootstrap, ok := deps.ListenerBroadcaster.Registry().Bootstrap(connectionID)
	return ok && bootstrap.UseTemporaryIDs
}

func resolveListenerProjectIDFromTemporary(
	value string,
	store realtime.ListenerTemporaryIDStore,
) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}
	if store == nil {
		return "", &listenerTemporaryIDError{message: "Temporary listener ids are unavailable on this Setta server."}
	}
	resolved, err := store.ResolveClientID(trimmed)
	if err == nil {
		return resolved, nil
	}
	var unknown *mcpx.UnknownTemporaryIDError
	if errors.As(err, &unknown) {
		return "", &listenerTemporaryIDError{message: unknown.Error()}
	}
	return "", err
}

func resolveListenerDependencyKeyFromTemporary(
	value string,
	store realtime.ListenerTemporaryIDStore,
) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}
	sectionID, codeObjID, hasCodeObj := strings.Cut(trimmed, ".")
	resolvedSectionID, err := resolveListenerProjectIDFromTemporary(sectionID, store)
	if err != nil {
		return "", err
	}
	if !hasCodeObj {
		return resolvedSectionID, nil
	}
	resolvedCodeObjID, err := resolveListenerProjectIDFromTemporary(codeObjID, store)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s.%s", resolvedSectionID, resolvedCodeObjID), nil
}

func listenerProjectIDForResponse(connectionID string, projectID string, deps RouteDependencies) (string, error) {
	if !listenerUsesTemporaryIDs(deps, connectionID) {
		return strings.TrimSpace(projectID), nil
	}
	if deps.TemporaryIDs == nil {
		return "", &listenerTemporaryIDError{message: "Temporary listener ids are unavailable on this Setta server."}
	}
	return deps.TemporaryIDs.EnsureTemporaryID(strings.TrimSpace(projectID))
}
