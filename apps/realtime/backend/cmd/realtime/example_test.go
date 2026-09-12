package main

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/contracts"
)

func TestNeonSketchExampleProcessesDrawing(t *testing.T) {
	application := openNeonSketchExample(t)
	reference := putExampleDrawing(t, application)
	emitExampleDrawing(t, application, reference)
	assertNeonExampleResult(t, application)
	assertPillowExampleResult(t, application)
	assertCombinedExampleResult(t, application)
}

func openNeonSketchExample(t *testing.T) *localApplication {
	t.Helper()
	opened, err := openLocalApplication(copyNeonSketchExample(t), false, neonSketchPython(t))
	if err != nil {
		t.Fatalf("openLocalApplication() error = %v", err)
	}
	application := opened.(*localApplication)
	t.Cleanup(func() { _ = application.Close() })
	initialized, err := application.coordinator.Reload(context.Background())
	if err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	if initialized.LoadError != nil || len(initialized.Handlers) != 3 || initialized.Handlers[0] != "combine" || initialized.Handlers[1] != "neon_glitch" || initialized.Handlers[2] != "pillow_risograph" {
		t.Fatalf("Reload() = %#v", initialized)
	}
	return application
}

func putExampleDrawing(t *testing.T, application *localApplication) contracts.ContentReference {
	t.Helper()
	var source bytes.Buffer
	pixels := image.NewRGBA(image.Rect(0, 0, 64, 40))
	draw.Draw(pixels, pixels.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	for x := 14; x < 50; x++ {
		for y := 18; y < 22; y++ {
			pixels.Set(x, y, color.Black)
		}
	}
	if err := png.Encode(&source, pixels); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	reference, err := application.content.Put("browser-example", "image/png", &source)
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	return reference
}

func emitExampleDrawing(t *testing.T, application *localApplication, reference contracts.ContentReference) {
	t.Helper()
	payload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": reference})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	runtimeSnapshot, err := application.coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	accepted, err := application.coordinator.HandleEvent(contracts.RuntimeEvent{
		Type: "event", Cause: "interaction", SessionID: runtimeSnapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload,
	})
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
}

func assertNeonExampleResult(t *testing.T, application *localApplication) {
	t.Helper()
	neon := waitForExampleResult(t, application, "result.contentRef")
	reader, err := application.content.Open(neon)
	if err != nil {
		t.Fatalf("content.Open() error = %v", err)
	}
	defer reader.Close()
	artifact, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("io.ReadAll() error = %v", err)
	}
	if neon.MediaType != "image/svg+xml" || !strings.Contains(string(artifact), "data:image/png;base64,") || !strings.Contains(string(artifact), "filter=\"url(#neon)\"") {
		t.Fatalf("neon artifact = %q, reference = %#v", artifact, neon)
	}
}

func assertPillowExampleResult(t *testing.T, application *localApplication) {
	t.Helper()
	pillow := waitForExampleResult(t, application, "pillow-result.contentRef")
	pillowReader, err := application.content.Open(pillow)
	if err != nil {
		t.Fatalf("content.Open(Pillow) error = %v", err)
	}
	defer pillowReader.Close()
	processed, err := png.Decode(pillowReader)
	if err != nil {
		t.Fatalf("png.Decode(Pillow) error = %v", err)
	}
	background := color.NRGBAModel.Convert(processed.At(0, 0)).(color.NRGBA)
	stroke := color.NRGBAModel.Convert(processed.At(32, 20)).(color.NRGBA)
	if pillow.MediaType != "image/png" || processed.Bounds() != image.Rect(0, 0, 64, 40) || background != (color.NRGBA{R: 0xff, G: 0xf7, B: 0xed, A: 0xff}) || stroke != (color.NRGBA{R: 0x17, G: 0x25, B: 0x54, A: 0xff}) {
		t.Fatalf("Pillow artifact bounds = %v, background = %#v, stroke = %#v, reference = %#v", processed.Bounds(), background, stroke, pillow)
	}
}

func assertCombinedExampleResult(t *testing.T, application *localApplication) {
	t.Helper()
	combined := waitForExampleResult(t, application, "final-result.contentRef")
	reader, err := application.content.Open(combined)
	if err != nil {
		t.Fatalf("content.Open(combined) error = %v", err)
	}
	defer reader.Close()
	artifact, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("io.ReadAll(combined) error = %v", err)
	}
	text := string(artifact)
	if combined.MediaType != "image/svg+xml" || !strings.Contains(text, "Neon + Risograph") || !strings.Contains(text, "data:image/svg+xml;base64,") || !strings.Contains(text, "data:image/png;base64,") {
		t.Fatalf("combined artifact = %q, reference = %#v", artifact, combined)
	}
}

func neonSketchPython(t *testing.T) string {
	t.Helper()
	relative := filepath.Join(".venv", "bin", "python")
	if runtime.GOOS == "windows" {
		relative = filepath.Join(".venv", "Scripts", "python.exe")
	}
	python := filepath.Join(neonSketchFixtureRoot(t), relative)
	info, err := os.Stat(python)
	if err != nil || !info.Mode().IsRegular() {
		t.Fatalf("Neon fixture Python is unavailable at %s; run its frozen uv sync", python)
	}
	return python
}

func copyNeonSketchExample(t *testing.T) string {
	t.Helper()
	sourceRoot := neonSketchFixtureRoot(t)
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

func neonSketchFixtureRoot(t *testing.T) string {
	t.Helper()
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller() could not locate the example test")
	}
	return filepath.Join(filepath.Dir(current), "..", "..", "..", "examples", "neon-sketch", "fixture")
}

func waitForExampleResult(t *testing.T, application *localApplication, key string) contracts.ContentReference {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := application.coordinator.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		value, exists := snapshot.Values[key]
		if exists {
			var reference contracts.ContentReference
			if err := json.Unmarshal(value, &reference); err != nil {
				t.Fatalf("json.Unmarshal(content reference) error = %v", err)
			}
			return reference
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("%s was not produced", key)
	return contracts.ContentReference{}
}
