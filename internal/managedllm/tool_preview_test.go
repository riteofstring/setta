package managedllm

import (
	"strings"
	"testing"

	"setta/internal/tools"
)

func TestToolPreviewAccumulatorBuildsAppSpecPatchEvent(t *testing.T) {
	t.Parallel()

	accumulator := newToolPreviewAccumulator()
	state := &toolCallState{
		index: 0,
		id:    "tool-call-1",
		name:  "setta__stream_app_definition",
	}
	state.arguments.WriteString("{\"projectConfigId\":\"project-alpha\",\"patches\":\"{\\\"op\\\":\\\"set\\\",\\\"path\\\":\\\"/root\\\",\\\"value\\\":\\\"stream-root\\\"}\\n\"}")

	event, err := accumulator.buildEvent("assistant-1", state, &tools.ToolArgumentPreviewMetadata{
		TargetIDPathsByType: map[tools.IDType][]string{},
		PreviewValuePath:    "patches",
		PreviewKind:         tools.PreviewKindAppSpecPatch,
	}, state.arguments.String(), nil)
	if err != nil {
		t.Fatalf("build preview event: %v", err)
	}
	if event == nil {
		t.Fatal("expected preview event")
	}
	if event.PreviewKind != string(tools.PreviewKindAppSpecPatch) {
		t.Fatalf("unexpected preview kind %#v", event)
	}
	if event.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %q", event.PreviewValueDelta)
	}
	if len(event.TargetIDsByType) != 0 {
		t.Fatalf("expected empty target ids, got %#v", event.TargetIDsByType)
	}

	repeat, err := accumulator.buildEvent("assistant-1", state, &tools.ToolArgumentPreviewMetadata{
		TargetIDPathsByType: map[tools.IDType][]string{},
		PreviewValuePath:    "patches",
		PreviewKind:         tools.PreviewKindAppSpecPatch,
	}, "", nil)
	if err != nil {
		t.Fatalf("build repeat preview event: %v", err)
	}
	if repeat != nil {
		t.Fatalf("expected duplicate preview to be suppressed, got %#v", repeat)
	}
}

func TestScanPartialJSONStringsHandlesEscapedPreviewString(t *testing.T) {
	t.Parallel()

	tokens, err := scanPartialJSONStrings("{\"patches\":\"{\\\"op\\\":\\\"set\\\"\"}")
	if err != nil {
		t.Fatalf("scan partial json strings: %v", err)
	}
	previewValue, ok := extractPreviewValueFromTokens(tokens, "patches")
	if !ok {
		t.Fatal("expected preview value token")
	}
	if !strings.HasPrefix(previewValue, "{\"op\":\"set\"") {
		t.Fatalf("unexpected preview value %q", previewValue)
	}
}
