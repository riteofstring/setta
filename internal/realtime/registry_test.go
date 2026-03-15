package realtime

import (
	"errors"
	"testing"
)

func TestRegistryAssignsFrontendAffinityTokensWithinSessionBoundaries(t *testing.T) {
	t.Parallel()

	// Frontend affinity tokens are server-owned and resolve only inside the
	// matching share-session scope.
	registry := NewRegistry(RegistryOptions{
		FrontendAffinityTokenSource: staticTokenSource("token-a"),
	})
	if _, err := registry.Register(RegisterParams{
		ID:             "frontend-a",
		Type:           ConnectionTypeFrontend,
		ShareSessionID: "session-a",
	}); err != nil {
		t.Fatalf("register frontend connection: %v", err)
	}

	token, ok := registry.FrontendAffinityToken("frontend-a")
	if !ok {
		t.Fatal("expected frontend affinity token")
	}
	if token != "token-a" {
		t.Fatalf("expected affinity token token-a, got %q", token)
	}
	if resolved, ok := registry.ResolveFrontendConnectionID(token, "session-a"); !ok || resolved != "frontend-a" {
		t.Fatalf("expected token to resolve to frontend-a inside session-a, got %q ok=%t", resolved, ok)
	}
	if resolved, ok := registry.ResolveFrontendConnectionID(token, "session-b"); ok || resolved != "" {
		t.Fatalf("expected token lookup to fail across sessions, got %q ok=%t", resolved, ok)
	}
}

func TestRegistryRebindsFrontendAffinityTokensAcrossReconnects(t *testing.T) {
	t.Parallel()

	// Reconnects keep affinity markers browser-stable, but the server should
	// mint a fresh token for each live frontend connection.
	registry := NewRegistry(RegistryOptions{
		FrontendAffinityTokenSource: sequenceTokenSource("token-a", "token-b"),
	})
	if _, err := registry.Register(RegisterParams{
		ID:             "frontend-a",
		Type:           ConnectionTypeFrontend,
		ShareSessionID: "session-a",
	}); err != nil {
		t.Fatalf("register first frontend connection: %v", err)
	}
	firstToken, ok := registry.FrontendAffinityToken("frontend-a")
	if !ok {
		t.Fatal("expected first frontend affinity token")
	}
	if err := registry.UpdateCurrentAddress("frontend-a", "/project#setta-ws-affinity=tab-stable"); err != nil {
		t.Fatalf("update first current address: %v", err)
	}
	if !registry.Unregister("frontend-a") {
		t.Fatal("expected first frontend unregister to succeed")
	}
	if resolved, ok := registry.ResolveFrontendConnectionID(firstToken, "session-a"); ok || resolved != "" {
		t.Fatalf("expected first token to stop resolving after disconnect, got %q ok=%t", resolved, ok)
	}

	if _, err := registry.Register(RegisterParams{
		ID:             "frontend-b",
		Type:           ConnectionTypeFrontend,
		ShareSessionID: "session-a",
	}); err != nil {
		t.Fatalf("register second frontend connection: %v", err)
	}
	secondToken, ok := registry.FrontendAffinityToken("frontend-b")
	if !ok {
		t.Fatal("expected second frontend affinity token")
	}
	if err := registry.UpdateCurrentAddress("frontend-b", "/project#setta-ws-affinity=tab-stable"); err != nil {
		t.Fatalf("update second current address: %v", err)
	}
	if firstToken == secondToken {
		t.Fatalf("expected a fresh token on reconnect, got %q", secondToken)
	}
	if resolved, ok := registry.ResolveFrontendConnectionID(secondToken, "session-a"); !ok || resolved != "frontend-b" {
		t.Fatalf("expected second token to resolve to frontend-b, got %q ok=%t", resolved, ok)
	}
}

func TestRegistrySanitizesCurrentAddressWithoutRebindingAffinity(t *testing.T) {
	t.Parallel()

	// Current-address updates should redact the affinity marker instead of
	// trusting any client-provided token value.
	registry := NewRegistry(RegistryOptions{
		FrontendAffinityTokenSource: staticTokenSource("server-owned"),
	})
	if _, err := registry.Register(RegisterParams{
		ID:             "frontend-a",
		Type:           ConnectionTypeFrontend,
		ShareSessionID: "session-a",
	}); err != nil {
		t.Fatalf("register frontend connection: %v", err)
	}
	if err := registry.UpdateCurrentAddress("frontend-a", "/project#setta-ws-affinity=spoofed"); err != nil {
		t.Fatalf("update current address: %v", err)
	}

	connection, ok := registry.Connection("frontend-a")
	if !ok {
		t.Fatal("expected registered connection")
	}
	if connection.CurrentAddress != "/project" {
		t.Fatalf("expected sanitized current address /project, got %q", connection.CurrentAddress)
	}
	if resolved, ok := registry.ResolveFrontendConnectionID("server-owned", "session-a"); !ok || resolved != "frontend-a" {
		t.Fatalf("expected original server-owned token to remain active, got %q ok=%t", resolved, ok)
	}
	if resolved, ok := registry.ResolveFrontendConnectionID("spoofed", "session-a"); ok || resolved != "" {
		t.Fatalf("expected spoofed token to stay unresolved, got %q ok=%t", resolved, ok)
	}
}

func TestRegistryConnectionsFiltersBySessionTypeAndAddress(t *testing.T) {
	t.Parallel()

	// Target selection should give later websocket fan-out code explicit,
	// deterministic filters instead of implicit global scans.
	registry := NewRegistry(RegistryOptions{})
	registerConnection(t, registry, RegisterParams{ID: "frontend-a", Type: ConnectionTypeFrontend, ShareSessionID: "session-a"})
	registerConnection(t, registry, RegisterParams{ID: "frontend-b", Type: ConnectionTypeFrontend, ShareSessionID: "session-b"})
	registerConnection(t, registry, RegisterParams{ID: "listener-a", Type: ConnectionTypeListener, ShareSessionID: "session-a"})
	registerConnection(t, registry, RegisterParams{ID: "terminal-a", Type: ConnectionTypeTerminal})
	if err := registry.UpdateCurrentAddress("frontend-a", "/project"); err != nil {
		t.Fatalf("update frontend-a current address: %v", err)
	}
	if err := registry.UpdateCurrentAddress("frontend-b", "/project"); err != nil {
		t.Fatalf("update frontend-b current address: %v", err)
	}
	if err := registry.UpdateCurrentAddress("listener-a", "/listeners"); err != nil {
		t.Fatalf("update listener-a current address: %v", err)
	}

	sessionAFrontends := registry.Connections(Selection{
		Type:           ConnectionTypeFrontend,
		ShareSessionID: "session-a",
	})
	if len(sessionAFrontends) != 1 || sessionAFrontends[0].ID != "frontend-a" {
		t.Fatalf("expected only frontend-a for session-a frontend selection, got %#v", sessionAFrontends)
	}

	projectPageConnections := registry.Connections(Selection{
		CurrentAddress: "/project",
	})
	if len(projectPageConnections) != 2 {
		t.Fatalf("expected two /project connections, got %d", len(projectPageConnections))
	}
	if projectPageConnections[0].ID != "frontend-a" || projectPageConnections[1].ID != "frontend-b" {
		t.Fatalf("expected sorted /project connections [frontend-a frontend-b], got %#v", projectPageConnections)
	}
}

func TestRegistryRejectsDuplicateConnectionID(t *testing.T) {
	t.Parallel()

	// Duplicate ids must fail fast so transport code never aliases two live
	// connections onto the same registry entry.
	registry := NewRegistry(RegistryOptions{})
	registerConnection(t, registry, RegisterParams{ID: "dup", Type: ConnectionTypeListener})

	_, err := registry.Register(RegisterParams{ID: "dup", Type: ConnectionTypeListener})
	if !errors.Is(err, ErrDuplicateConnection) {
		t.Fatalf("expected duplicate connection error, got %v", err)
	}
}

func staticTokenSource(token string) TokenSource {
	return func() (string, error) {
		return token, nil
	}
}

func sequenceTokenSource(tokens ...string) TokenSource {
	index := 0
	return func() (string, error) {
		if index >= len(tokens) {
			return "", errors.New("token source exhausted")
		}
		token := tokens[index]
		index++
		return token, nil
	}
}

func registerConnection(t *testing.T, registry *Registry, params RegisterParams) {
	t.Helper()

	if _, err := registry.Register(params); err != nil {
		t.Fatalf("register connection %s: %v", params.ID, err)
	}
}
