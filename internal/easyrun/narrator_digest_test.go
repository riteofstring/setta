package easyrun

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestNarratorDigestCondensesTypedEventsWithoutRawOutputs(t *testing.T) {
	source := chat.RunItemCommandSourceAgent
	events := []chat.Event{
		chatDigestEvent(chat.EventTypeAssistantTextDelta, chat.AssistantTextDeltaPayload{
			Delta: " Inspecting the request\n",
		}),
		chatDigestEvent(chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
			Item: chat.RunItem{
				Type:       chat.RunItemTypeReasoning,
				Summary:    "**Mapping parser modules**\nPrivate details are not here.",
				HiddenText: "secret private chain",
			},
		}),
		chatDigestEvent(chat.EventTypeRunItemCreated, chat.RunItemCreatedPayload{
			Item: chat.RunItem{
				Type: chat.RunItemTypeCommandExecution,
				Details: chat.NewRunItemCommandExecutionDetails(chat.RunItemCommandExecutionDetails{
					Command: "pnpm -C desktop test",
					Result:  "raw command output must not enter the digest",
					Source:  &source,
				}),
			},
		}),
		chatDigestEvent(chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
			Item: chat.RunItem{
				Type: chat.RunItemTypeFileChange,
				Details: chat.NewRunItemFileChangeDetails(chat.RunItemFileChangeDetails{
					Paths: []chat.RunItemFileChangePath{
						{Path: "/tmp/setta/internal/easyrun/service.go", Patch: "+raw patch"},
						{Path: "/tmp/setta/README.md", Patch: "-raw patch"},
					},
				}),
			},
		}),
		chatDigestEvent(chat.EventTypeRunItemOutputDelta, chat.RunItemOutputDeltaPayload{
			Output: chat.RunItemOutput{Text: "raw output delta"},
		}),
	}

	var entries []narratorDigestEntry
	for _, event := range events {
		next, err := narratorDigestEntriesFromChatEvent(event)
		if err != nil {
			t.Fatalf("digest chat event %s: %v", event.Type, err)
		}
		entries = append(entries, next...)
	}
	artifactEntries := narratorDigestEntriesFromEasyRunEvent(EasyRunEvent{
		ArtifactCreated: &EasyArtifactCreatedPayload{Artifact: EasyArtifact{Title: "Implementation Report"}},
		EmittedAt:       "2026-07-09T12:00:05Z",
		EventID:         "event_artifact",
		Sequence:        8,
		Type:            EasyRunEventTypeArtifactCreated,
	})
	entries = append(entries, artifactEntries...)

	if got, want := digestTexts(entries), []string{
		"Inspecting the request",
		"**Mapping parser modules**",
		"pnpm -C desktop test",
		"service.go, README.md",
		"Implementation Report",
	}; strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("digest texts = %#v, want %#v", got, want)
	}
	if got, want := digestSources(entries), []narratorDigestSourceKind{
		narratorDigestSourceAssistantText,
		narratorDigestSourceReasoning,
		narratorDigestSourceCommand,
		narratorDigestSourceFileChange,
		narratorDigestSourceArtifact,
	}; strings.Join(sourceStrings(got), "\n") != strings.Join(sourceStrings(want), "\n") {
		t.Fatalf("digest sources = %#v, want %#v", got, want)
	}
	joined := strings.Join(digestTexts(entries), "\n")
	for _, forbidden := range []string{"secret private chain", "raw command output", "raw output delta", "+raw patch", "-raw patch"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("digest leaked %q in %q", forbidden, joined)
		}
	}
}

func TestNarratorDigestBufferBoundsAndConsumesPendingOnce(t *testing.T) {
	buffer := newNarratorDigestBuffer(3, 10)
	buffer.append(
		narratorDigestEntry{Text: "one"},
		narratorDigestEntry{Text: "two"},
		narratorDigestEntry{Text: "three"},
		narratorDigestEntry{Text: "four"},
		narratorDigestEntry{Text: "five"},
	)

	snapshot := buffer.snapshot()
	if got, want := digestTexts(snapshot), []string{"four", "five"}; strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("bounded snapshot texts = %#v, want %#v", got, want)
	}
	if buffer.totalTextBytes > 10 {
		t.Fatalf("buffer text bytes = %d, want <= 10", buffer.totalTextBytes)
	}
	pending := buffer.consumePending()
	if got, want := digestTexts(pending), []string{"four", "five"}; strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("first pending = %#v, want %#v", got, want)
	}
	if second := buffer.consumePending(); len(second) != 0 {
		t.Fatalf("second pending = %+v, want consumed entries not resent", second)
	}

	buffer.append(narratorDigestEntry{Text: "six"})
	pending = buffer.consumePending()
	if got, want := digestTexts(pending), []string{"six"}; strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("pending after append = %#v, want %#v", got, want)
	}
}

func TestNarratorTriggerPolicyRespectsCadenceThresholdAndTerminal(t *testing.T) {
	now := time.Date(2026, 7, 9, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name  string
		input narratorTriggerInput
		want  bool
	}{
		{
			name: "below digest threshold",
			input: narratorTriggerInput{
				LastCallAt:          now.Add(-minNarratorInterval),
				NewDigestEntryCount: minNewDigestEntries - 1,
				Now:                 now,
			},
			want: false,
		},
		{
			name: "inside interval",
			input: narratorTriggerInput{
				LastCallAt:          now.Add(-minNarratorInterval + time.Second),
				NewDigestEntryCount: minNewDigestEntries,
				Now:                 now,
			},
			want: false,
		},
		{
			name: "threshold and interval met",
			input: narratorTriggerInput{
				LastCallAt:          now.Add(-minNarratorInterval),
				NewDigestEntryCount: minNewDigestEntries,
				Now:                 now,
			},
			want: true,
		},
		{
			name: "terminal summary call bypasses digest threshold",
			input: narratorTriggerInput{
				NewDigestEntryCount: 0,
				Now:                 now,
				Terminal:            true,
			},
			want: true,
		},
		{
			name: "in flight blocks terminal duplicate",
			input: narratorTriggerInput{
				InFlight: true,
				Now:      now,
				Terminal: true,
			},
			want: false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := shouldTriggerNarrator(test.input); got != test.want {
				t.Fatalf("shouldTriggerNarrator() = %v, want %v", got, test.want)
			}
		})
	}
}

func chatDigestEvent(eventType string, payload any) chat.Event {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return chat.Event{
		EmittedAt: "2026-07-09T12:00:00Z",
		EventID:   "event_" + strings.ReplaceAll(eventType, ".", "_"),
		Payload:   data,
		Sequence:  7,
		Type:      eventType,
	}
}

func digestTexts(entries []narratorDigestEntry) []string {
	texts := make([]string, 0, len(entries))
	for _, entry := range entries {
		texts = append(texts, entry.Text)
	}
	return texts
}

func digestSources(entries []narratorDigestEntry) []narratorDigestSourceKind {
	sources := make([]narratorDigestSourceKind, 0, len(entries))
	for _, entry := range entries {
		sources = append(sources, entry.Source)
	}
	return sources
}

func sourceStrings(sources []narratorDigestSourceKind) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		values = append(values, string(source))
	}
	return values
}
