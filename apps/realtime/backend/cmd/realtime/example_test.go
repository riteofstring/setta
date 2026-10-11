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

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
)

func TestNeonSketchExampleProcessesDrawing(t *testing.T) {
	application := openNeonSketchExample(t)
	reference := putExampleDrawing(t, application)
	emitExampleDrawing(t, application, reference)
	assertAuroraExampleResult(t, application)
	assertRisographExampleResult(t, application)
	assertPosterExampleResult(t, application)
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
	if initialized.LoadError != nil || len(initialized.Handlers) != 4 || initialized.Handlers[0] != "aurora_bloom" || initialized.Handlers[1] != "compose_poster" || initialized.Handlers[2] != "prepare_sketch" || initialized.Handlers[3] != "riso_split" {
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
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
}

func assertAuroraExampleResult(t *testing.T, application *localApplication) {
	t.Helper()
	aurora := waitForExampleResult(t, application, "aurora-result.contentRef")
	reader, err := application.content.Open(aurora)
	if err != nil {
		t.Fatalf("content.Open() error = %v", err)
	}
	defer reader.Close()
	artifact, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("io.ReadAll() error = %v", err)
	}
	if aurora.MediaType != "image/svg+xml" || !strings.Contains(string(artifact), "AURORA CHANNEL") || !strings.Contains(string(artifact), "data:image/png;base64,") || !strings.Contains(string(artifact), "filter=\"url(#bloom)\"") {
		t.Fatalf("aurora artifact = %q, reference = %#v", artifact, aurora)
	}
}

func assertRisographExampleResult(t *testing.T, application *localApplication) {
	t.Helper()
	risograph := waitForExampleResult(t, application, "riso-result.contentRef")
	risographReader, err := application.content.Open(risograph)
	if err != nil {
		t.Fatalf("content.Open(risograph) error = %v", err)
	}
	defer risographReader.Close()
	processed, err := png.Decode(risographReader)
	if err != nil {
		t.Fatalf("png.Decode(risograph) error = %v", err)
	}
	background := color.NRGBAModel.Convert(processed.At(10, 10)).(color.NRGBA)
	stroke := color.NRGBAModel.Convert(processed.At(32, 20)).(color.NRGBA)
	paperLike := background.R > 0xe0 && background.G > 0xd0 && background.B > 0xb0
	if risograph.MediaType != "image/png" || processed.Bounds() != image.Rect(0, 0, 64, 40) || !paperLike || stroke != (color.NRGBA{R: 0x17, G: 0x25, B: 0x54, A: 0xff}) {
		t.Fatalf("risograph artifact bounds = %v, background = %#v, stroke = %#v, reference = %#v", processed.Bounds(), background, stroke, risograph)
	}
}

func assertPosterExampleResult(t *testing.T, application *localApplication) {
	t.Helper()
	poster := waitForExampleResult(t, application, "final-result.contentRef")
	reader, err := application.content.Open(poster)
	if err != nil {
		t.Fatalf("content.Open(poster) error = %v", err)
	}
	defer reader.Close()
	artifact, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("io.ReadAll(poster) error = %v", err)
	}
	text := string(artifact)
	if poster.MediaType != "image/svg+xml" || !strings.Contains(text, "DRAW ONCE.") || !strings.Contains(text, "RENDER TWICE.") || !strings.Contains(text, "data:image/svg+xml;base64,") || !strings.Contains(text, "data:image/png;base64,") {
		t.Fatalf("poster artifact = %q, reference = %#v", artifact, poster)
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
