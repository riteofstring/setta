package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	binarypayload "setta/internal/binary"
	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func TestListenerProducerEmitSectionBinaryDeltasScopesToShareSession(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newListenerProducerDeploymentRuntime(t)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share-a session: %v", err)
	}
	if _, err := deploymentRuntime.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share-b session: %v", err)
	}

	hub := NewWebsocketHub(WebsocketHubOptions{})
	broadcaster := NewListenerBroadcaster(ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	producer := NewListenerProducer(ListenerProducerOptions{
		Broadcaster: broadcaster,
		Deployment:  deploymentRuntime,
	})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	listenerA := connectListenerSocket(t, server.URL, hub, "listener-a", "share-a")
	defer listenerA.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "share-a", map[string]ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"draw-section"},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	listenerB := connectListenerSocket(t, server.URL, hub, "listener-b", "share-b")
	defer listenerB.CloseNow()
	recordBootstrapAndRegistration(t, broadcaster, "listener-b", "project-a", "share-b", map[string]ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"draw-section"},
			DependencyMode: ListenerDependencyModeRealtimeOnly,
		},
	})

	ref := binarypayload.ContentRef{
		ContentID:  "bin-1",
		ByteLength: int64(len("binary-share-a")),
		MimeType:   "image/png",
	}
	if err := producer.EmitSectionBinaryDeltas(context.Background(), EmitSectionBinaryDeltasParams{
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		Deltas: []BinarySectionDelta{
			{
				SectionID:     "draw-section",
				Value:         ref,
				BinaryPayload: []byte("binary-share-a"),
			},
		},
	}); err != nil {
		t.Fatalf("emit section binary deltas: %v", err)
	}

	envelope, payload := readBinaryEnvelope(t, listenerA)
	assertListenerRealtimeMessage(t, envelope, "project-a", "share-a", 1, `{"type":"Binary","payload":{"contentId":"bin-1","byteLength":14,"mimeType":"image/png"}}`)
	if string(payload) != "binary-share-a" {
		t.Fatalf("expected binary-share-a payload, got %q", string(payload))
	}

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err := listenerB.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected no share-b listener payload, got %v", err)
	}
}

func newListenerProducerDeploymentRuntime(t *testing.T) *deployments.Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-a",
		Projects: map[string]projectstate.Project{
			"project-a": {
				ID:   "project-a",
				Name: "Project A",
			},
		},
	}
	writeListenerProducerJSON(t, filepath.Join(root, projectstate.MainFileName), document)
	writeListenerProducerJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-a",
		"deploymentVersion":      "v1",
	})
	writeListenerProducerJSON(t, filepath.Join(root, "policy.json"), map[string]any{})

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
		},
		IDGenerator: func() string {
			return "generated-share"
		},
	})
	if err != nil {
		t.Fatalf("open listener producer deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close listener producer deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func writeListenerProducerJSON(t *testing.T, path string, value any) {
	t.Helper()

	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		t.Fatalf("mkdir listener producer parent: %v", err)
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal listener producer json: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write listener producer json: %v", err)
	}
}
