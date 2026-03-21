package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestListenerBroadcasterEmitRealtimeDeltasBinarySendsBinaryFrame(t *testing.T) {
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
		"cb-a": {
			Dependencies:   []string{"section-a.param-a"},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	sequence, delivered, err := broadcaster.EmitRealtimeDeltasBinary(context.Background(), EmitRealtimeDeltasBinaryParams{
		ProjectID: "project-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-1"}}`),
			},
		},
		BinaryPayload: []byte("binary-ui-change"),
	})
	if err != nil {
		t.Fatalf("emit realtime binary delta: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected binary realtime delivery (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	envelope, payload := readBinaryEnvelope(t, listener)
	assertListenerRealtimeMessage(t, envelope, "project-a", "", 1, `{"type":"Binary","payload":{"contentId":"bin-1"}}`)
	if string(payload) != "binary-ui-change" {
		t.Fatalf("expected binary-ui-change payload, got %q", string(payload))
	}
}

func TestListenerBroadcasterEmitRealtimeDeltasBinaryKeepsAllDeltasOnSharedPayloadFrame(t *testing.T) {
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
		"cb-a": {
			Dependencies: []string{
				"section-a.param-a",
				"section-b.param-b",
			},
			DependencyMode: ListenerDependencyModeAlways,
		},
	})

	sequence, delivered, err := broadcaster.EmitRealtimeDeltasBinary(context.Background(), EmitRealtimeDeltasBinaryParams{
		ProjectID: "project-a",
		Deltas: []ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-1"}}`),
			},
			{
				Dependency: "section-b.param-b",
				Value:      json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-1"}}`),
			},
		},
		BinaryPayload: []byte("shared-binary"),
	})
	if err != nil {
		t.Fatalf("emit realtime binary deltas: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected shared binary realtime delivery (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	envelope, payload := readBinaryEnvelope(t, listener)
	if envelope.MessageType != MessageTypeListenerRealtimeEvent {
		t.Fatalf("expected listener realtime event, got %q", envelope.MessageType)
	}

	var content ListenerRealtimeEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event content: %v", err)
	}
	if content.ProjectConfigID != "project-a" {
		t.Fatalf("expected project id %q, got %q", "project-a", content.ProjectConfigID)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.Deltas) != 2 {
		t.Fatalf("expected 2 deltas, got %d", len(content.Deltas))
	}
	if content.Deltas[0].Dependency != "section-a.param-a" {
		t.Fatalf("expected first dependency %q, got %q", "section-a.param-a", content.Deltas[0].Dependency)
	}
	if content.Deltas[1].Dependency != "section-b.param-b" {
		t.Fatalf("expected second dependency %q, got %q", "section-b.param-b", content.Deltas[1].Dependency)
	}
	if string(content.Deltas[0].Value) != `{"type":"Binary","payload":{"contentId":"bin-1"}}` {
		t.Fatalf("expected first delta value to preserve binary ref, got %s", string(content.Deltas[0].Value))
	}
	if string(content.Deltas[1].Value) != `{"type":"Binary","payload":{"contentId":"bin-1"}}` {
		t.Fatalf("expected second delta value to preserve binary ref, got %s", string(content.Deltas[1].Value))
	}
	if string(payload) != "shared-binary" {
		t.Fatalf("expected shared-binary payload, got %q", string(payload))
	}
}

func TestListenerBroadcasterEmitDependencyEventsBinarySendsBinaryFrame(t *testing.T) {
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
		"cb-a": {
			Dependencies:   []string{"section-action"},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	sequence, delivered, err := broadcaster.EmitDependencyEventsBinary(context.Background(), EmitDependencyEventsBinaryParams{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: "section-action",
				Payload:       json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-2"}}`),
				TimestampMS:   123,
			},
		},
		BinaryPayload: []byte("binary-action"),
	})
	if err != nil {
		t.Fatalf("emit binary dependency event: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected binary dependency delivery (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	envelope, payload := readBinaryEnvelope(t, listener)
	assertListenerDependencyEventMessage(t, envelope, "project-a", "", 1, `{"type":"Binary","payload":{"contentId":"bin-2"}}`)
	if string(payload) != "binary-action" {
		t.Fatalf("expected binary-action payload, got %q", string(payload))
	}
}

func TestListenerBroadcasterEmitDependencyEventsBinaryKeepsAllEventsOnSharedPayloadFrame(t *testing.T) {
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
		"cb-a": {
			Dependencies: []string{
				"section-action",
				"section-other",
			},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	sequence, delivered, err := broadcaster.EmitDependencyEventsBinary(context.Background(), EmitDependencyEventsBinaryParams{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: "section-action",
				Payload:       json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-2"}}`),
				TimestampMS:   123,
			},
			{
				DependencyKey: "section-other",
				Payload:       json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-2"}}`),
				TimestampMS:   456,
			},
		},
		BinaryPayload: []byte("shared-action"),
	})
	if err != nil {
		t.Fatalf("emit binary dependency events: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected shared binary dependency delivery (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	envelope, payload := readBinaryEnvelope(t, listener)
	if envelope.MessageType != MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", envelope.MessageType)
	}

	var content ListenerDependencyEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event content: %v", err)
	}
	if content.ProjectConfigID != "project-a" {
		t.Fatalf("expected project id %q, got %q", "project-a", content.ProjectConfigID)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.DependencyEvents) != 2 {
		t.Fatalf("expected 2 dependency events, got %d", len(content.DependencyEvents))
	}
	if content.DependencyEvents[0].DependencyKey != "section-action" {
		t.Fatalf("expected first dependency key %q, got %q", "section-action", content.DependencyEvents[0].DependencyKey)
	}
	if content.DependencyEvents[1].DependencyKey != "section-other" {
		t.Fatalf("expected second dependency key %q, got %q", "section-other", content.DependencyEvents[1].DependencyKey)
	}
	if canonicalJSONPayload(t, content.DependencyEvents[0].Payload) != canonicalJSONPayload(t, json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-2"}}`)) {
		t.Fatalf("expected first dependency event to preserve binary ref, got %s", string(content.DependencyEvents[0].Payload))
	}
	if canonicalJSONPayload(t, content.DependencyEvents[1].Payload) != canonicalJSONPayload(t, json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-2"}}`)) {
		t.Fatalf("expected second dependency event to preserve binary ref, got %s", string(content.DependencyEvents[1].Payload))
	}
	if string(payload) != "shared-action" {
		t.Fatalf("expected shared-action payload, got %q", string(payload))
	}
}

func readBinaryEnvelope(t *testing.T, conn *websocket.Conn) (hubMessageEnvelope, []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket frame: %v", err)
	}
	if messageType != websocket.MessageBinary {
		t.Fatalf("expected binary websocket frame, got %d", messageType)
	}

	header, binaryPayload, err := DecodeBinaryFrame(payload)
	if err != nil {
		t.Fatalf("decode binary websocket frame: %v", err)
	}

	var envelope hubMessageEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode binary websocket header: %v", err)
	}
	return envelope, binaryPayload
}
