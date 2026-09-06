package main

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/contracts"
)

func TestNeonSketchExampleProcessesDrawing(t *testing.T) {
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is unavailable")
	}
	projectRoot := copyNeonSketchExample(t)
	opened, err := openLocalApplication(projectRoot, false, python)
	if err != nil {
		t.Fatalf("openLocalApplication() error = %v", err)
	}
	application := opened.(*localApplication)
	t.Cleanup(func() { _ = application.Close() })
	initialized, err := application.coordinator.Reload(context.Background())
	if err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	if initialized.LoadError != nil || len(initialized.Handlers) != 1 || initialized.Handlers[0] != "neon_glitch" {
		t.Fatalf("Reload() = %#v", initialized)
	}
	var source bytes.Buffer
	pixels := image.NewRGBA(image.Rect(0, 0, 3, 2))
	pixels.Set(1, 0, color.Black)
	pixels.Set(1, 1, color.Black)
	if err := png.Encode(&source, pixels); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	reference, err := application.content.Put("browser-example", "image/png", &source)
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	payload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": reference})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	runtimeSnapshot, err := application.coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	accepted, err := application.coordinator.HandleEvent(contracts.RuntimeEvent{
		Type: "event", SessionID: runtimeSnapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload,
	})
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
	result := waitForNeonResult(t, application)
	reader, err := application.content.Open(result)
	if err != nil {
		t.Fatalf("content.Open() error = %v", err)
	}
	defer reader.Close()
	artifact, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("io.ReadAll() error = %v", err)
	}
	if result.MediaType != "image/svg+xml" || !strings.Contains(string(artifact), "data:image/png;base64,") || !strings.Contains(string(artifact), "filter=\"url(#neon)\"") {
		t.Fatalf("neon artifact = %q, reference = %#v", artifact, result)
	}
}

func copyNeonSketchExample(t *testing.T) string {
	t.Helper()
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller() could not locate the example test")
	}
	sourceRoot := filepath.Join(filepath.Dir(current), "..", "..", "..", "examples", "neon-sketch", "fixture")
	targetRoot := t.TempDir()
	for _, relative := range []string{"app.py", filepath.Join(".local", "realtime", "project.json")} {
		value, err := os.ReadFile(filepath.Join(sourceRoot, relative))
		if err != nil {
			t.Fatalf("os.ReadFile(%s) error = %v", relative, err)
		}
		target := filepath.Join(targetRoot, relative)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatalf("os.MkdirAll(%s) error = %v", relative, err)
		}
		if err := os.WriteFile(target, value, 0o600); err != nil {
			t.Fatalf("os.WriteFile(%s) error = %v", relative, err)
		}
	}
	return targetRoot
}

func waitForNeonResult(t *testing.T, application *localApplication) contracts.ContentReference {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := application.coordinator.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		value, exists := snapshot.Values["result.contentRef"]
		if exists {
			var reference contracts.ContentReference
			if err := json.Unmarshal(value, &reference); err != nil {
				t.Fatalf("json.Unmarshal(content reference) error = %v", err)
			}
			return reference
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("neon result was not produced")
	return contracts.ContentReference{}
}
