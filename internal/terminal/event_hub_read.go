package terminal

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"unicode/utf8"
)

type retainedTerminalOutputChunk struct {
	data      []byte
	emittedAt string
	eventID   string
	sequence  int
}

func (hub *eventHub) recentOutput(sessionID string, limitBytes int) (TerminalRecentOutputPage, error) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return TerminalRecentOutputPage{}, errors.New("terminal event stream is closed")
	}
	buffer := hub.sessionBuffers[sessionID]
	if buffer == nil {
		return emptyRecentOutputPage(), nil
	}
	now := hub.clock().UTC()
	droppedBytes, droppedChunks := hub.trimExpiredLocked(buffer, now)
	hub.storeReplayTruncationLocked(buffer, droppedBytes, droppedChunks, now)
	return recentOutputFromRetainedEvents(buffer.events, limitBytes)
}

func recentOutputFromRetainedEvents(events []retainedTerminalEvent, limitBytes int) (TerminalRecentOutputPage, error) {
	page := emptyRecentOutputPage()
	output := make([]retainedTerminalOutputChunk, 0, len(events))
	for _, retained := range events {
		switch retained.event.Type {
		case TerminalEventBufferTruncated:
			page.DroppedBytes += retained.event.Payload.DroppedBytes
			page.DroppedChunks += retained.event.Payload.DroppedChunks
		case TerminalEventOutput:
			data, err := base64.StdEncoding.DecodeString(retained.event.Payload.DataBase64)
			if err != nil {
				return TerminalRecentOutputPage{}, fmt.Errorf("decode retained terminal output event %s: %w", retained.event.EventID, err)
			}
			if len(data) != retained.event.Payload.ByteCount {
				return TerminalRecentOutputPage{}, fmt.Errorf("retained terminal output event %s decoded to %d bytes, want %d", retained.event.EventID, len(data), retained.event.Payload.ByteCount)
			}
			output = append(output, retainedTerminalOutputChunk{
				data:      data,
				emittedAt: retained.event.EmittedAt,
				eventID:   retained.event.EventID,
				sequence:  retained.event.Sequence,
			})
		}
	}
	if len(output) == 0 {
		return page, nil
	}
	selected, omittedBytes, omittedChunks := recentOutputTail(output, limitBytes)
	page.OmittedBytes = omittedBytes
	page.OmittedChunks = omittedChunks
	page.Truncated = omittedBytes > 0 || omittedChunks > 0

	var text bytes.Buffer
	for _, chunk := range selected {
		page.Chunks = append(page.Chunks, TerminalRecentOutputChunk{
			ByteCount:        len(chunk.data),
			DataBase64:       base64.StdEncoding.EncodeToString(chunk.data),
			EmittedAt:        chunk.emittedAt,
			EventID:          chunk.eventID,
			EventOffsetBytes: chunk.offset,
			Sequence:         chunk.sequence,
		})
		page.ByteCount += len(chunk.data)
		_, _ = text.Write(chunk.data)
	}
	combined := text.Bytes()
	page.TextUTF8Valid = utf8.Valid(combined)
	if page.TextUTF8Valid {
		page.Text = string(combined)
	}
	return page, nil
}

type selectedTerminalOutputChunk struct {
	data      []byte
	emittedAt string
	eventID   string
	offset    int
	sequence  int
}

func recentOutputTail(output []retainedTerminalOutputChunk, limitBytes int) ([]selectedTerminalOutputChunk, int, int) {
	selected := []selectedTerminalOutputChunk{}
	remaining := limitBytes
	omittedBytes := 0
	omittedChunks := 0
	for index := len(output) - 1; index >= 0; index-- {
		chunk := output[index]
		if remaining <= 0 {
			omittedBytes += len(chunk.data)
			omittedChunks += 1
			continue
		}
		if len(chunk.data) <= remaining {
			selected = append(selected, selectedTerminalOutputChunk{
				data:      chunk.data,
				emittedAt: chunk.emittedAt,
				eventID:   chunk.eventID,
				sequence:  chunk.sequence,
			})
			remaining -= len(chunk.data)
			continue
		}
		offset := len(chunk.data) - remaining
		selected = append(selected, selectedTerminalOutputChunk{
			data:      chunk.data[offset:],
			emittedAt: chunk.emittedAt,
			eventID:   chunk.eventID,
			offset:    offset,
			sequence:  chunk.sequence,
		})
		omittedBytes += offset
		omittedChunks += 1
		remaining = 0
	}
	reverseSelectedTerminalOutputChunks(selected)
	return selected, omittedBytes, omittedChunks
}

func reverseSelectedTerminalOutputChunks(chunks []selectedTerminalOutputChunk) {
	for left, right := 0, len(chunks)-1; left < right; left, right = left+1, right-1 {
		chunks[left], chunks[right] = chunks[right], chunks[left]
	}
}

func emptyRecentOutputPage() TerminalRecentOutputPage {
	return TerminalRecentOutputPage{
		Chunks:        []TerminalRecentOutputChunk{},
		TextUTF8Valid: true,
	}
}
