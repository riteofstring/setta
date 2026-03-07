package realtime

import (
	"errors"
	"testing"
)

func TestListenerRegistryUsesBootstrapProjectAndShareSessionForRegistration(t *testing.T) {
	t.Parallel()

	// Listener registration should inherit its project/session scope from the
	// bootstrap record so force-refresh and realtime routing stay aligned.
	registry := NewListenerRegistry()
	if err := registry.RecordBootstrap(ListenerBootstrap{
		ConnectionID:   "listener-a",
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
	}); err != nil {
		t.Fatalf("record bootstrap: %v", err)
	}

	if err := registry.UpsertRegistration(
		"listener-a",
		"",
		map[string]ListenerCallback{
			"cb": {
				Dependencies:   []string{"section-a.param-a"},
				DependencyMode: ListenerDependencyModeAlways,
			},
		},
		"",
	); err != nil {
		t.Fatalf("upsert registration: %v", err)
	}

	bootstrapTargets := registry.BootstrapConnectionIDs("project-a", "session-a")
	if len(bootstrapTargets) != 1 || bootstrapTargets[0] != "listener-a" {
		t.Fatalf("expected bootstrap target [listener-a], got %#v", bootstrapTargets)
	}

	matchingTargets := registry.MatchingConnectionIDs(
		"project-a",
		[]string{"section-a.param-a"},
		"session-a",
	)
	if len(matchingTargets) != 1 || matchingTargets[0] != "listener-a" {
		t.Fatalf("expected matching target [listener-a], got %#v", matchingTargets)
	}
}

func TestListenerRegistryMatchesWildcardAndShareScopedRegistrations(t *testing.T) {
	t.Parallel()

	// Share-scoped listener fan-out should include wildcard/shared listeners and
	// exclude refresh-only or unrelated-session registrations.
	registry := NewListenerRegistry()
	registerListener(t, registry, "listener-session-a", "project-a", "session-a", map[string]ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})
	registerListener(t, registry, "listener-session-b", "project-a", "session-b", map[string]ListenerCallback{
		"cb-b": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})
	registerListener(t, registry, "listener-shared", "project-a", "", map[string]ListenerCallback{
		"cb-any": {
			Dependencies:   []string{},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})
	registerListener(t, registry, "listener-refresh", "project-a", "session-a", map[string]ListenerCallback{
		"cb-refresh": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeRefreshOnly,
		},
	})

	sessionAMatches := registry.MatchingConnectionIDs(
		"project-a",
		[]string{"section-a.param-a"},
		"session-a",
	)
	if len(sessionAMatches) != 2 || sessionAMatches[0] != "listener-session-a" || sessionAMatches[1] != "listener-shared" {
		t.Fatalf("expected session-a matches [listener-session-a listener-shared], got %#v", sessionAMatches)
	}

	allMatches := registry.MatchingConnectionIDs(
		"project-a",
		[]string{"section-a.param-a"},
		"",
	)
	if len(allMatches) != 3 || allMatches[0] != "listener-session-a" || allMatches[1] != "listener-session-b" || allMatches[2] != "listener-shared" {
		t.Fatalf("expected all matches [listener-session-a listener-session-b listener-shared], got %#v", allMatches)
	}
}

func TestListenerRegistryRejectsBlankDependenciesAndInvalidModes(t *testing.T) {
	t.Parallel()

	// Listener callback definitions should fail fast when their dependency or
	// mode contract is ambiguous.
	registry := NewListenerRegistry()

	err := registry.UpsertRegistration(
		"listener-a",
		"project-a",
		map[string]ListenerCallback{
			"cb-blank": {
				Dependencies:   []string{" "},
				DependencyMode: ListenerDependencyModeAlways,
			},
		},
		"",
	)
	if !errors.Is(err, ErrEmptyListenerDependency) {
		t.Fatalf("expected empty listener dependency error, got %v", err)
	}

	err = registry.UpsertRegistration(
		"listener-a",
		"project-a",
		map[string]ListenerCallback{
			"cb-invalid-mode": {
				Dependencies:   []string{"section-a.param-a"},
				DependencyMode: ListenerDependencyMode("unsupported"),
			},
		},
		"",
	)
	if !errors.Is(err, ErrInvalidListenerDependencyMode) {
		t.Fatalf("expected invalid dependency mode error, got %v", err)
	}
}

func registerListener(
	t *testing.T,
	registry *ListenerRegistry,
	connectionID string,
	projectID string,
	shareSessionID string,
	callbacks map[string]ListenerCallback,
) {
	t.Helper()

	if err := registry.UpsertRegistration(connectionID, projectID, callbacks, shareSessionID); err != nil {
		t.Fatalf("register listener %s: %v", connectionID, err)
	}
}
