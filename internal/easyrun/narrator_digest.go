package easyrun

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/chat"
)

const (
	defaultNarratorDigestMaxEntries = 120
	defaultNarratorDigestMaxBytes   = 32 * 1024
	minNarratorInterval             = 15 * time.Second
	minNewDigestEntries             = 8
)

type narratorDigestSourceKind string

const (
	narratorDigestSourceAssistantText narratorDigestSourceKind = "assistant_text"
	narratorDigestSourceReasoning     narratorDigestSourceKind = "reasoning"
	narratorDigestSourceCommand       narratorDigestSourceKind = "command"
	narratorDigestSourceFileChange    narratorDigestSourceKind = "file_change"
	narratorDigestSourceArtifact      narratorDigestSourceKind = "artifact"
)

type narratorDigestEntry struct {
	Ordinal  int                      `json:"ordinal"`
	Source   narratorDigestSourceKind `json:"source"`
	Text     string                   `json:"text"`
	At       string                   `json:"at"`
	EventID  string                   `json:"eventId"`
	Sequence int                      `json:"sequence"`
}

type narratorDigestBuffer struct {
	entries         []narratorDigestEntry
	maxBytes        int
	maxEntries      int
	nextOrdinal     int
	totalTextBytes  int
	consumedThrough int
}

type narratorTriggerInput struct {
	InFlight            bool
	LastCallAt          time.Time
	NewDigestEntryCount int
	Now                 time.Time
	Terminal            bool
}

func newNarratorDigestBuffer(maxEntries int, maxBytes int) *narratorDigestBuffer {
	if maxEntries <= 0 {
		maxEntries = defaultNarratorDigestMaxEntries
	}
	if maxBytes <= 0 {
		maxBytes = defaultNarratorDigestMaxBytes
	}
	return &narratorDigestBuffer{
		entries:     []narratorDigestEntry{},
		maxBytes:    maxBytes,
		maxEntries:  maxEntries,
		nextOrdinal: 1,
	}
}

func (buffer *narratorDigestBuffer) append(entries ...narratorDigestEntry) {
	if buffer == nil {
		return
	}
	for _, entry := range entries {
		entry.Text = strings.TrimSpace(entry.Text)
		if entry.Text == "" {
			continue
		}
		entry.Ordinal = buffer.nextOrdinal
		buffer.nextOrdinal += 1
		buffer.entries = append(buffer.entries, entry)
		buffer.totalTextBytes += len(entry.Text)
		buffer.enforceBounds()
	}
}

func (buffer *narratorDigestBuffer) pendingCount() int {
	if buffer == nil {
		return 0
	}
	count := 0
	for _, entry := range buffer.entries {
		if entry.Ordinal > buffer.consumedThrough {
			count += 1
		}
	}
	return count
}

func (buffer *narratorDigestBuffer) consumePending() []narratorDigestEntry {
	if buffer == nil {
		return []narratorDigestEntry{}
	}
	pending := make([]narratorDigestEntry, 0, buffer.pendingCount())
	for _, entry := range buffer.entries {
		if entry.Ordinal > buffer.consumedThrough {
			pending = append(pending, entry)
		}
	}
	if len(pending) > 0 {
		buffer.consumedThrough = pending[len(pending)-1].Ordinal
	}
	return pending
}

func (buffer *narratorDigestBuffer) snapshot() []narratorDigestEntry {
	if buffer == nil {
		return []narratorDigestEntry{}
	}
	return append([]narratorDigestEntry(nil), buffer.entries...)
}

func (buffer *narratorDigestBuffer) enforceBounds() {
	for len(buffer.entries) > buffer.maxEntries || buffer.totalTextBytes > buffer.maxBytes {
		buffer.totalTextBytes -= len(buffer.entries[0].Text)
		buffer.entries = buffer.entries[1:]
		if len(buffer.entries) == 0 {
			break
		}
	}
}

func shouldTriggerNarrator(input narratorTriggerInput) bool {
	if input.InFlight {
		return false
	}
	if input.Terminal {
		return true
	}
	if input.NewDigestEntryCount < minNewDigestEntries {
		return false
	}
	if input.LastCallAt.IsZero() {
		return true
	}
	return !input.Now.Before(input.LastCallAt.Add(minNarratorInterval))
}

func narratorDigestEntriesFromChatEvent(event chat.Event) ([]narratorDigestEntry, error) {
	switch event.Type {
	case chat.EventTypeAssistantTextDelta:
		var payload chat.AssistantTextDeltaPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return nil, err
		}
		return singleNarratorDigestEntry(event, narratorDigestSourceAssistantText, payload.Delta), nil
	case chat.EventTypeRunItemCreated:
		var payload chat.RunItemCreatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return nil, err
		}
		return narratorDigestEntriesFromRunItem(event, payload.Item), nil
	case chat.EventTypeRunItemUpdated:
		var payload chat.RunItemUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return nil, err
		}
		return narratorDigestEntriesFromRunItem(event, payload.Item), nil
	default:
		return []narratorDigestEntry{}, nil
	}
}

func narratorDigestEntriesFromEasyRunEvent(event EasyRunEvent) []narratorDigestEntry {
	if event.Type != EasyRunEventTypeArtifactCreated || event.ArtifactCreated == nil {
		return []narratorDigestEntry{}
	}
	return []narratorDigestEntry{{
		At:       event.EmittedAt,
		EventID:  event.EventID,
		Sequence: event.Sequence,
		Source:   narratorDigestSourceArtifact,
		Text:     event.ArtifactCreated.Artifact.Title,
	}}
}

func narratorDigestEntriesFromRunItem(event chat.Event, item chat.RunItem) []narratorDigestEntry {
	switch item.Type {
	case chat.RunItemTypeReasoning:
		return singleNarratorDigestEntry(event, narratorDigestSourceReasoning, publicReasoningDigestText(item))
	case chat.RunItemTypeCommandExecution:
		return singleNarratorDigestEntry(event, narratorDigestSourceCommand, commandDigestText(item))
	case chat.RunItemTypeFileChange:
		return singleNarratorDigestEntry(event, narratorDigestSourceFileChange, fileChangeDigestText(item))
	default:
		return []narratorDigestEntry{}
	}
}

func singleNarratorDigestEntry(event chat.Event, source narratorDigestSourceKind, text string) []narratorDigestEntry {
	text = strings.TrimSpace(text)
	if text == "" {
		return []narratorDigestEntry{}
	}
	return []narratorDigestEntry{{
		At:       event.EmittedAt,
		EventID:  event.EventID,
		Sequence: event.Sequence,
		Source:   source,
		Text:     firstDigestLine(text),
	}}
}

func publicReasoningDigestText(item chat.RunItem) string {
	if strings.TrimSpace(item.Summary) != "" {
		return item.Summary
	}
	return item.Progress
}

func commandDigestText(item chat.RunItem) string {
	if source := item.Source; source != nil && *source != chat.RunItemCommandSourceAgent {
		return ""
	}
	if details, ok := item.CommandExecutionDetails(); ok {
		if source := details.Source; source != nil && *source != chat.RunItemCommandSourceAgent {
			return ""
		}
		if strings.TrimSpace(details.Command) != "" {
			return details.Command
		}
	}
	if strings.TrimSpace(item.Command) != "" {
		return item.Command
	}
	return item.Title
}

func fileChangeDigestText(item chat.RunItem) string {
	details, ok := item.FileChangeDetails()
	if !ok || len(details.Paths) == 0 {
		return ""
	}
	names := make([]string, 0, len(details.Paths))
	for _, path := range details.Paths {
		name := strings.TrimSpace(filepath.Base(path.Path))
		if name != "" && name != "." {
			names = append(names, name)
		}
	}
	return strings.Join(names, ", ")
}

func firstDigestLine(text string) string {
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}
