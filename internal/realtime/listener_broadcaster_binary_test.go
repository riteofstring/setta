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
