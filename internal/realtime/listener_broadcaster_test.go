package realtime

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/coder/websocket"
)

func TestListenerBroadcasterEmitRealtimeDeltasFiltersByDependencyAndShareSession(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	listenerA := connectListenerSocket(t, server.URL, hub, "listener-a", "session-a")
	defer listenerA.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "session-a", map[string]ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	listenerB := connectListenerSocket(t, server.URL, hub, "listener-b", "session-b")
	defer listenerB.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-b", "project-a", "session-b", map[string]ListenerCallback{
		"cb-b": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	listenerShared := connectListenerSocket(t, server.URL, hub, "listener-shared", "")
	defer listenerShared.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-shared", "project-a", "", map[string]ListenerCallback{
		"cb-any": {
			Dependencies:   []string{},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	listenerRefreshOnly := connectListenerSocket(t, server.URL, hub, "listener-refresh", "session-a")
	defer listenerRefreshOnly.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-refresh", "project-a", "session-a", map[string]ListenerCallback{
		"cb-refresh": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeRefreshOnly,
		},
	})

	sequence, delivered, err := broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"value-a1"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit first session-a realtime delta: %v", err)
	}
	if sequence != 1 || delivered != 2 {
		t.Fatalf("expected first session-a delivery (sequence=1 delivered=2), got sequence=%d delivered=%d", sequence, delivered)
	}

	sequence, delivered, err = broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"value-a2"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit second session-a realtime delta: %v", err)
	}
	if sequence != 2 || delivered != 2 {
		t.Fatalf("expected second session-a delivery (sequence=2 delivered=2), got sequence=%d delivered=%d", sequence, delivered)
	}

	sequence, delivered, err = broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-b",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"value-b1"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit session-b realtime delta: %v", err)
	}
	if sequence != 1 || delivered != 2 {
		t.Fatalf("expected session-b delivery (sequence=1 delivered=2), got sequence=%d delivered=%d", sequence, delivered)
	}

	assertListenerRealtimeMessage(t, readEnvelope(t, listenerA), "project-a", "session-a", 1, `"value-a1"`)
	assertListenerRealtimeMessage(t, readEnvelope(t, listenerA), "project-a", "session-a", 2, `"value-a2"`)
	assertListenerRealtimeMessage(t, readEnvelope(t, listenerB), "project-a", "session-b", 1, `"value-b1"`)

	assertListenerRealtimeMessage(t, readEnvelope(t, listenerShared), "project-a", "session-a", 1, `"value-a1"`)
	assertListenerRealtimeMessage(t, readEnvelope(t, listenerShared), "project-a", "session-a", 2, `"value-a2"`)
	assertListenerRealtimeMessage(t, readEnvelope(t, listenerShared), "project-a", "session-b", 1, `"value-b1"`)
}

func TestListenerBroadcasterEmitDependencyEventsFiltersByDependencyModeAndShareSession(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	listenerA := connectListenerSocket(t, server.URL, hub, "listener-a", "session-a")
	defer listenerA.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "session-a", map[string]ListenerCallback{
		"cb-action": {
			Dependencies:   []string{"section-action"},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	listenerB := connectListenerSocket(t, server.URL, hub, "listener-b", "session-b")
	defer listenerB.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-b", "project-a", "session-b", map[string]ListenerCallback{
		"cb-action": {
			Dependencies:   []string{"section-action"},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	listenerShared := connectListenerSocket(t, server.URL, hub, "listener-shared", "")
	defer listenerShared.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-shared", "project-a", "", map[string]ListenerCallback{
		"cb-any": {
			Dependencies:   []string{},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	listenerRefreshOnly := connectListenerSocket(t, server.URL, hub, "listener-refresh", "session-a")
	defer listenerRefreshOnly.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-refresh", "project-a", "session-a", map[string]ListenerCallback{
		"cb-refresh": {
			Dependencies:   []string{"section-action"},
			DependencyMode: ListenerDependencyModeRefreshOnly,
		},
	})

	sequence, delivered, err := broadcaster.EmitDependencyEvents(context.Background(), EmitDependencyEventsParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: "section-action",
				Payload:       json.RawMessage(`{"clicked":true}`),
				TimestampMS:   123,
			},
		},
	})
	if err != nil {
		t.Fatalf("emit dependency events: %v", err)
	}
	if sequence != 1 || delivered != 2 {
		t.Fatalf("expected dependency event delivery (sequence=1 delivered=2), got sequence=%d delivered=%d", sequence, delivered)
	}

	assertListenerDependencyEventMessage(t, readEnvelope(t, listenerA), "project-a", "session-a", 1, `{"clicked":true}`)
	assertListenerDependencyEventMessage(t, readEnvelope(t, listenerShared), "project-a", "session-a", 1, `{"clicked":true}`)
}

func TestListenerBroadcasterDependencyEventsShareSequenceWithRealtimeDeltas(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	listener := connectListenerSocket(t, server.URL, hub, "listener-a", "")
	defer listener.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "", map[string]ListenerCallback{
		"cb-realtime": {
			Dependencies:   []string{"section-a.param-a", "section-action"},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	realtimeSequence, delivered, err := broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID: "project-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"value-1"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit realtime delta: %v", err)
	}
	if realtimeSequence != 1 || delivered != 1 {
		t.Fatalf("expected realtime sequence 1 with 1 delivery, got sequence=%d delivered=%d", realtimeSequence, delivered)
	}

	dependencySequence, delivered, err := broadcaster.EmitDependencyEvents(context.Background(), EmitDependencyEventsParams{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: "section-action",
				Payload:       json.RawMessage(`{"clicked":true}`),
				TimestampMS:   456,
			},
		},
	})
	if err != nil {
		t.Fatalf("emit dependency event: %v", err)
	}
	if dependencySequence != 2 || delivered != 1 {
		t.Fatalf("expected dependency event sequence 2 with 1 delivery, got sequence=%d delivered=%d", dependencySequence, delivered)
	}

	assertListenerRealtimeMessage(t, readEnvelope(t, listener), "project-a", "", 1, `"value-1"`)
	assertListenerDependencyEventMessage(t, readEnvelope(t, listener), "project-a", "", 2, `{"clicked":true}`)
}

func TestListenerBroadcasterDropShareSessionRemovesRegistrationsAndSequences(t *testing.T) {
	t.Parallel()

	sequencer := NewSequencer()
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: NewWebsocketHub(WebsocketHubOptions{}),
		Sequencer:    sequencer,
	})

	if err := broadcaster.Registry().RecordBootstrap(ListenerBootstrap{
		ConnectionID:   "listener-a",
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
	}); err != nil {
		t.Fatalf("record bootstrap: %v", err)
	}
	if err := broadcaster.Registry().UpsertRegistration(
		"listener-a",
		"project-a",
		map[string]ListenerCallback{
			"cb-a": {
				Dependencies:   []string{"section-a.param-a"},
				DependencyMode: ListenerDependencyModeAlways,
			},
		},
		"session-a",
	); err != nil {
		t.Fatalf("upsert registration: %v", err)
	}
	if _, err := sequencer.Next(Scope{ProjectID: "project-a", ShareSessionID: "session-a"}); err != nil {
		t.Fatalf("seed dropped session sequence: %v", err)
	}
	if _, err := sequencer.Next(Scope{ProjectID: "project-a", ShareSessionID: "session-b"}); err != nil {
		t.Fatalf("seed retained session sequence: %v", err)
	}

	broadcaster.DropShareSession("session-a")

	if got := broadcaster.Registry().BootstrapConnectionIDs("project-a", "session-a"); len(got) != 0 {
		t.Fatalf("expected no bootstraps for dropped share session, got %#v", got)
	}
	if got := broadcaster.Registry().MatchingConnectionIDs("project-a", []string{"section-a.param-a"}, "session-a"); len(got) != 0 {
		t.Fatalf("expected no registrations for dropped share session, got %#v", got)
	}
	if current, ok := sequencer.Current(Scope{ProjectID: "project-a", ShareSessionID: "session-a"}); ok || current != 0 {
		t.Fatalf("expected dropped share-session sequence to be removed, got %d ok=%t", current, ok)
	}
	if current, ok := sequencer.Current(Scope{ProjectID: "project-a", ShareSessionID: "session-b"}); !ok || current != 1 {
		t.Fatalf("expected other session sequence to remain, got %d ok=%t", current, ok)
	}
}

func TestListenerBroadcasterForceRefreshTargetsBootstrappedListenersAndResetsSequence(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	listenerA := connectListenerSocket(t, server.URL, hub, "listener-a", "session-a")
	defer listenerA.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "session-a", map[string]ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	listenerBootstrapOnly := connectListenerSocket(t, server.URL, hub, "listener-bootstrap", "session-a")
	defer listenerBootstrapOnly.CloseNow()
	recordBootstrapOnly(t, broadcaster, "listener-bootstrap", "project-a", "session-a")

	listenerShared := connectListenerSocket(t, server.URL, hub, "listener-shared", "")
	defer listenerShared.CloseNow()
	recordBootstrapOnly(t, broadcaster, "listener-shared", "project-a", "")

	sequence, delivered, err := broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"before-refresh"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit realtime delta before force refresh: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected first realtime delta before force refresh (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	projectState := json.RawMessage(`{"projectId":"project-a","version":1}`)
	delivered, err = broadcaster.SendForceRefresh(context.Background(), ForceRefreshParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
		ProjectState:   projectState,
	})
	if err != nil {
		t.Fatalf("send force refresh: %v", err)
	}
	if delivered != 3 {
		t.Fatalf("expected force refresh to deliver to 3 bootstrapped listeners, got %d", delivered)
	}

	sequence, delivered, err = broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID:      "project-a",
		ShareSessionID: "session-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"after-refresh"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit realtime delta after force refresh: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected realtime delta after force refresh to reset to sequence 1 with 1 delivery, got sequence=%d delivered=%d", sequence, delivered)
	}

	assertListenerRealtimeMessage(t, readEnvelope(t, listenerA), "project-a", "session-a", 1, `"before-refresh"`)
	assertListenerForceRefreshMessage(t, readEnvelope(t, listenerA), "project-a", "session-a", projectState)
	assertListenerRealtimeMessage(t, readEnvelope(t, listenerA), "project-a", "session-a", 1, `"after-refresh"`)

	assertListenerForceRefreshMessage(t, readEnvelope(t, listenerBootstrapOnly), "project-a", "session-a", projectState)
	assertListenerForceRefreshMessage(t, readEnvelope(t, listenerShared), "project-a", "session-a", projectState)
}

func TestListenerBroadcasterForceRefreshResetsSequenceWithoutTargets(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})

	sequence, delivered, err := broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID: "project-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"seed"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("seed realtime delta without targets: %v", err)
	}
	if sequence != 1 || delivered != 0 {
		t.Fatalf("expected seed realtime delta (sequence=1 delivered=0), got sequence=%d delivered=%d", sequence, delivered)
	}

	delivered, err = broadcaster.SendForceRefresh(context.Background(), ForceRefreshParams{
		ProjectID: "project-a",
	})
	if err != nil {
		t.Fatalf("send force refresh without targets: %v", err)
	}
	if delivered != 0 {
		t.Fatalf("expected zero deliveries for force refresh without targets, got %d", delivered)
	}

	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	listenerA := connectListenerSocket(t, server.URL, hub, "listener-a", "")
	defer listenerA.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "", map[string]ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	sequence, delivered, err = broadcaster.EmitRealtimeDeltas(context.Background(), EmitRealtimeDeltasParams{
		ProjectID: "project-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"after-reset"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit realtime delta after empty force refresh: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected realtime delta after empty force refresh (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	assertListenerRealtimeMessage(t, readEnvelope(t, listenerA), "project-a", "", 1, `"after-reset"`)
}

func connectListenerSocket(t *testing.T, serverURL string, hub *WebsocketHub, connectionID string, shareSessionID string) *websocket.Conn {
	t.Helper()

	conn := dialWebsocketHubClient(t, serverURL, map[string]string{
		"id":        connectionID,
		"type":      string(ConnectionTypeListener),
		"session":   shareSessionID,
		"broadcast": "false",
	})
	waitForHubConnection(t, hub, connectionID)
	return conn
}

func recordBootstrapAndRegistration(
	t *testing.T,
	broadcaster *ListenerBroadcaster,
	connectionID string,
	projectID string,
	shareSessionID string,
	callbacks map[string]ListenerCallback,
) {
	t.Helper()

	recordBootstrapOnly(t, broadcaster, connectionID, projectID, shareSessionID)
	if err := broadcaster.Registry().UpsertRegistration(connectionID, projectID, callbacks, shareSessionID); err != nil {
		t.Fatalf("upsert listener registration for %s: %v", connectionID, err)
	}
}

func recordBootstrapOnly(
	t *testing.T,
	broadcaster *ListenerBroadcaster,
	connectionID string,
	projectID string,
	shareSessionID string,
) {
	t.Helper()

	if err := broadcaster.Registry().RecordBootstrap(ListenerBootstrap{
		ConnectionID:   connectionID,
		ProjectID:      projectID,
		ShareSessionID: shareSessionID,
	}); err != nil {
		t.Fatalf("record listener bootstrap for %s: %v", connectionID, err)
	}
}

func assertListenerRealtimeMessage(
	t *testing.T,
	envelope hubMessageEnvelope,
	projectID string,
	shareSessionID string,
	sequence uint64,
	expectedValue string,
) {
	t.Helper()

	if envelope.MessageType != MessageTypeListenerRealtimeEvent {
		t.Fatalf("expected listener realtime event, got %q", envelope.MessageType)
	}

	var content ListenerRealtimeEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event content: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if content.Sequence != sequence {
		t.Fatalf("expected sequence %d, got %d", sequence, content.Sequence)
	}
	if len(content.Deltas) != 1 {
		t.Fatalf("expected 1 delta, got %d", len(content.Deltas))
	}
	if string(content.Deltas[0].Value) != expectedValue {
		t.Fatalf("expected delta value %s, got %s", expectedValue, string(content.Deltas[0].Value))
	}
}

func assertListenerForceRefreshMessage(
	t *testing.T,
	envelope hubMessageEnvelope,
	projectID string,
	shareSessionID string,
	projectState json.RawMessage,
) {
	t.Helper()

	if envelope.MessageType != MessageTypeListenerForceRefresh {
		t.Fatalf("expected listener force refresh, got %q", envelope.MessageType)
	}

	var content ListenerForceRefreshContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener force refresh content: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if string(content.ProjectState) != string(projectState) {
		t.Fatalf("expected project state %s, got %s", string(projectState), string(content.ProjectState))
	}
}

func assertListenerDependencyEventMessage(
	t *testing.T,
	envelope hubMessageEnvelope,
	projectID string,
	shareSessionID string,
	sequence uint64,
	expectedPayload string,
) {
	t.Helper()

	if envelope.MessageType != MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", envelope.MessageType)
	}

	var content ListenerDependencyEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event content: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if content.Sequence != sequence {
		t.Fatalf("expected sequence %d, got %d", sequence, content.Sequence)
	}
	if len(content.DependencyEvents) != 1 {
		t.Fatalf("expected 1 dependency event, got %d", len(content.DependencyEvents))
	}
	if content.DependencyEvents[0].DependencyKey != "section-action" {
		t.Fatalf("expected dependency key section-action, got %q", content.DependencyEvents[0].DependencyKey)
	}
	if canonicalJSONPayload(t, content.DependencyEvents[0].Payload) != canonicalJSONPayload(t, json.RawMessage(expectedPayload)) {
		t.Fatalf("expected dependency payload %s, got %s", expectedPayload, string(content.DependencyEvents[0].Payload))
	}
}

func canonicalJSONPayload(t *testing.T, payload json.RawMessage) string {
	t.Helper()

	var decoded any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode json payload %q: %v", string(payload), err)
	}
	encoded, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-encode json payload %q: %v", string(payload), err)
	}
	return string(encoded)
}
