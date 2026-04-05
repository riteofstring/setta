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

func TestExtractPreviewTargetIDsFromTokensCollectsArrayValuesAndObjectKeys(t *testing.T) {
	t.Parallel()

	tokens, err := scanPartialJSONStrings(
		"{\"sectionId\":\"temp-1\",\"sectionIds\":[\"temp-2\",\"temp-3\"],\"sectionsById\":{\"temp-4\":true,\"temp-5\":false}}",
	)
	if err != nil {
		t.Fatalf("scan partial json strings: %v", err)
	}

	idsByType := extractPreviewTargetIDsFromTokens(tokens, map[tools.IDType][]string{
		tools.IDTypeSection: {"sectionId", "sectionIds", "sectionsById"},
	})

	got := idsByType[tools.IDTypeSection]
	want := []string{"temp-1", "temp-2", "temp-3", "temp-4", "temp-5"}
	if len(got) != len(want) {
		t.Fatalf("expected section ids %#v, got %#v", want, got)
	}
	for index, expected := range want {
		if got[index] != expected {
			t.Fatalf("expected section id %q at index %d, got %#v", expected, index, got)
		}
	}
}

func TestExtractPreviewTargetIDsFromTokensCollectsNestedArrayValues(t *testing.T) {
	t.Parallel()

	tokens, err := scanPartialJSONStrings(
		"{\"sectionIds\":[[\"temp-1\"],[\"temp-2\",\"temp-3\"]]}",
	)
	if err != nil {
		t.Fatalf("scan partial json strings: %v", err)
	}

	idsByType := extractPreviewTargetIDsFromTokens(tokens, map[tools.IDType][]string{
		tools.IDTypeSection: {"sectionIds"},
	})

	got := idsByType[tools.IDTypeSection]
	want := []string{"temp-1", "temp-2", "temp-3"}
	if len(got) != len(want) {
		t.Fatalf("expected section ids %#v, got %#v", want, got)
	}
	for index, expected := range want {
		if got[index] != expected {
			t.Fatalf("expected section id %q at index %d, got %#v", expected, index, got)
		}
	}
}

func TestCanonicalizePreviewTargetIDsByTypeResolvesTemporaryIDs(t *testing.T) {
	t.Parallel()

	got, ok := canonicalizePreviewTargetIDsByType(
		map[tools.IDType][]string{
			tools.IDTypeSection:    {"14", "section-1"},
			tools.IDTypeCodeObject: {"27"},
		},
		map[tools.IDType][]string{
			tools.IDTypeSection:    {"sectionId"},
			tools.IDTypeCodeObject: {"paramInfoId"},
		},
		map[string]string{
			"14":        "section-1",
			"27":        "param-7",
			"section-1": "section-1",
			"param-7":   "param-7",
		},
	)
	if !ok {
		t.Fatal("expected canonicalized preview ids")
	}
	want := map[string][]string{
		"section": {"section-1"},
		"codeObj": {"param-7"},
	}
	if !previewStringSliceMapsEqual(got, want) {
		t.Fatalf("unexpected canonicalized preview ids %#v", got)
	}
}

func TestExtractPreviewValueFromTokensReturnsPartialString(t *testing.T) {
	t.Parallel()

	tokens, err := scanPartialJSONStrings("{\"code\":\"print(")
	if err != nil {
		t.Fatalf("scan partial json strings: %v", err)
	}
	previewValue, ok := extractPreviewValueFromTokens(tokens, "code")
	if !ok {
		t.Fatal("expected preview value token")
	}
	if previewValue != "print(" {
		t.Fatalf("unexpected preview value %q", previewValue)
	}
}

func TestExtractPreviewValueFromTokensDecodesEscapes(t *testing.T) {
	t.Parallel()

	tokens, err := scanPartialJSONStrings("{\"code\":\"line1\\nline2\\u003a\"}")
	if err != nil {
		t.Fatalf("scan partial json strings: %v", err)
	}
	previewValue, ok := extractPreviewValueFromTokens(tokens, "code")
	if !ok {
		t.Fatal("expected preview value token")
	}
	if previewValue != "line1\nline2:" {
		t.Fatalf("unexpected preview value %q", previewValue)
	}
}

func TestExtractPreviewValueFromTokensUsesLatestMatchingValue(t *testing.T) {
	t.Parallel()

	tokens, err := scanPartialJSONStrings("{\"code\":\"first\",\"code\":\"second\"}")
	if err != nil {
		t.Fatalf("scan partial json strings: %v", err)
	}
	previewValue, ok := extractPreviewValueFromTokens(tokens, "code")
	if !ok {
		t.Fatal("expected preview value token")
	}
	if previewValue != "second" {
		t.Fatalf("unexpected preview value %q", previewValue)
	}
}
