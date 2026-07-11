package easyrun

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestDecodeNarratorTaskOutputRequiresBoundedCurrentFocus(t *testing.T) {
	valid, err := decodeNarratorTaskOutput(json.RawMessage(`{"currentFocus":"Compare paint and memory cost.","highlights":[],"summary":""}`))
	if err != nil {
		t.Fatalf("decode valid narrator output: %v", err)
	}
	if valid.CurrentFocus != "Compare paint and memory cost." {
		t.Fatalf("current focus = %q, want exact valid output", valid.CurrentFocus)
	}

	tests := []struct {
		name string
		raw  map[string]any
		want string
	}{
		{
			name: "missing",
			raw:  map[string]any{"highlights": []string{}, "summary": ""},
			want: "current focus is required",
		},
		{
			name: "surrounding whitespace",
			raw: map[string]any{
				"currentFocus": "  Compare paint and memory cost. ",
				"highlights":   []string{},
				"summary":      "",
			},
			want: "must not contain leading or trailing whitespace",
		},
		{
			name: "oversized",
			raw: map[string]any{
				"currentFocus": strings.Repeat("界", maxNarratorCurrentFocusRunes+1),
				"highlights":   []string{},
				"summary":      "",
			},
			want: "maximum is 320",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			raw, err := json.Marshal(test.raw)
			if err != nil {
				t.Fatalf("encode narrator output: %v", err)
			}
			_, err = decodeNarratorTaskOutput(raw)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("decode error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestWorkingNarratorRejectsTerminalSummary(t *testing.T) {
	result, err := narratorHarnessResult(map[string]any{
		"currentFocus": "Keep the working objective current.",
		"highlights":   []string{},
		"summary":      "This must not appear before the run is terminal.",
	})
	if err != nil {
		t.Fatalf("build working narrator result: %v", err)
	}
	narration := workingNarrationFromHarnessResult(result)
	if narration.err == nil || !strings.Contains(narration.err.Error(), "working summary must be empty") {
		t.Fatalf("working narration error = %v, want non-empty summary rejection", narration.err)
	}
}

func TestApplyNarratorCurrentFocusRevisesOnlyChangedText(t *testing.T) {
	run := testRun("easy_run_focus_projection")
	initialUpdatedAt := run.CurrentFocus.UpdatedAt
	projectionTime := time.Date(2026, 7, 8, 12, 0, 30, 0, time.UTC)

	if err := applyNarratorCurrentFocus(&run, run.CurrentFocus.Text, EasyRunFocusStatusCurrent, projectionTime); err != nil {
		t.Fatalf("apply unchanged focus: %v", err)
	}
	if run.CurrentFocus.Revision != 0 || run.CurrentFocus.UpdatedAt != initialUpdatedAt {
		t.Fatalf("unchanged focus = %+v, want revision and text timestamp preserved", run.CurrentFocus)
	}

	if err := applyNarratorCurrentFocus(&run, "Compare paint and memory cost.", EasyRunFocusStatusCurrent, projectionTime); err != nil {
		t.Fatalf("apply revised focus: %v", err)
	}
	if run.CurrentFocus.Revision != 1 ||
		run.CurrentFocus.Text != "Compare paint and memory cost." ||
		run.CurrentFocus.UpdatedAt != "2026-07-08T12:00:30Z" {
		t.Fatalf("revised focus = %+v, want revision one at projection time", run.CurrentFocus)
	}
}

func TestNarratorPromptSeparatesFocusSteeringAndSpeakableNarration(t *testing.T) {
	prompt := productionNarratorPrompt()
	for _, required := range []string{
		"return previousCurrentFocus exactly",
		"Incorporate every supplied user_steer entry",
		"revision-zero previousCurrentFocus longer than the currentFocus schema limit",
		"Never quote a user_steer as a highlight",
		"must work when read aloud verbatim",
		"Do not include file paths",
	} {
		if !strings.Contains(prompt, required) {
			t.Fatalf("narrator prompt is missing %q", required)
		}
	}
}
