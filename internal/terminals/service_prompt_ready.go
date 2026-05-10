package terminals

import (
	"bytes"
	"fmt"
	"time"
)

func buildPromptReadyMarker(id uint64) string {
	return "SETTA_CLEAR_CMD"
}

func buildPromptReadyCommand(marker string) []byte {
	return []byte(fmt.Sprintf("alias %s='clear'\n%s\n", marker, marker))
}

func (s *Service) bootstrapPromptReady(session *session) {
	if session == nil || session.promptReadyMarker == "" {
		return
	}
	session.setPromptReadyActive(true)
	if err := s.writeToSession(session, buildPromptReadyCommand(session.promptReadyMarker), false); err != nil {
		session.markPromptReady()
		return
	}

	go func() {
		timer := time.NewTimer(defaultPromptReadyWait)
		defer timer.Stop()
		<-timer.C
		session.appendOutput(session.flushPromptReadyBuffer())
		session.markPromptReady()
	}()
}

func (s *Service) ensurePromptReady(session *session) {
	if session == nil || session.promptReadyMarker == "" {
		return
	}
	session.promptReadyStart.Do(func() {
		s.bootstrapPromptReady(session)
	})
}

func (s *Service) expandRunCommandEchoWidth(session *session, commandLen int) (func(), error) {
	session.mu.RLock()
	rows := session.rows
	columns := session.columns
	session.mu.RUnlock()

	if rows < 1 || columns < 1 || columns >= runCommandEchoColumns || commandLen < columns {
		return nil, nil
	}

	if err := session.pty.Resize(runCommandEchoColumns, rows); err != nil {
		return nil, fmt.Errorf("resize terminal for command echo: %w", err)
	}

	return func() {
		session.mu.RLock()
		restoreRows := session.rows
		restoreColumns := session.columns
		session.mu.RUnlock()
		if restoreRows < 1 || restoreColumns < 1 {
			return
		}
		_ = session.pty.Resize(restoreColumns, restoreRows)
	}, nil
}

func (session *session) captureOutput(data []byte) ([]byte, bool) {
	if session == nil || len(data) == 0 {
		return nil, false
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.promptReadyAwaitingVisibleOutput {
		session.promptReadyAwaitingVisibleOutput = false
		return append([]byte(nil), data...), true
	}

	if session.promptReadyMarker == "" || !session.promptReadyActive {
		return append([]byte(nil), data...), false
	}

	session.promptReadyBuffer = append(session.promptReadyBuffer, data...)
	bufferLimit := session.history.limit
	if bufferLimit <= 0 {
		bufferLimit = defaultHistoryLimitBytes
	}
	if len(session.promptReadyBuffer) > bufferLimit {
		start := len(session.promptReadyBuffer) - bufferLimit
		session.promptReadyBuffer = append([]byte(nil), session.promptReadyBuffer[start:]...)
	}

	outputStart, ok := findPromptReadyLineEndRawOffset(session.promptReadyBuffer, session.promptReadyMarker)
	if !ok {
		return nil, false
	}

	output := append([]byte(nil), session.promptReadyBuffer[outputStart:]...)
	session.promptReadyMarker = ""
	session.promptReadyActive = false
	session.promptReadyBuffer = nil
	if len(output) == 0 {
		session.promptReadyAwaitingVisibleOutput = true
		return nil, false
	}
	return output, true
}

func (session *session) flushPromptReadyBuffer() []byte {
	if session == nil {
		return nil
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.promptReadyMarker == "" || !session.promptReadyActive || len(session.promptReadyBuffer) == 0 {
		session.promptReadyMarker = ""
		session.promptReadyActive = false
		session.promptReadyBuffer = nil
		return nil
	}

	buffer := append([]byte(nil), session.promptReadyBuffer...)
	session.promptReadyMarker = ""
	session.promptReadyActive = false
	session.promptReadyBuffer = nil
	return buffer
}

func (session *session) markPromptReady() {
	if session == nil {
		return
	}
	session.promptReadyOnce.Do(func() {
		session.clearPromptReadyState()
		close(session.promptReady)
	})
}

func (session *session) waitForPromptReady() error {
	if session == nil || session.promptReady == nil {
		return nil
	}
	<-session.promptReady
	return nil
}

func findPromptReadyLineEndRawOffset(raw []byte, marker string) (int, bool) {
	if len(raw) == 0 || marker == "" {
		return 0, false
	}
	if offset, ok := findPromptReadyLineEndRawOffsetDirect(raw, marker); ok {
		return offset, true
	}

	normalized, offsets := normalizeTerminalSearchBuffer(raw)
	markerIndex := bytes.LastIndex(normalized, []byte(marker))
	if markerIndex < 0 {
		return 0, false
	}

	lineEnd := bytes.IndexByte(normalized[markerIndex:], '\n')
	if lineEnd < 0 {
		return 0, false
	}
	return offsets[markerIndex+lineEnd], true
}

func findPromptReadyLineEndRawOffsetDirect(raw []byte, marker string) (int, bool) {
	markerIndex := bytes.LastIndex(raw, []byte(marker))
	if markerIndex < 0 {
		return 0, false
	}
	for index := markerIndex + len(marker); index < len(raw); index++ {
		if raw[index] == '\n' {
			return index + 1, true
		}
	}
	return 0, false
}

func normalizeTerminalSearchBuffer(raw []byte) ([]byte, []int) {
	normalized := make([]byte, 0, len(raw))
	offsets := make([]int, 0, len(raw))

	for index := 0; index < len(raw); index++ {
		if nextIndex, ok := consumeTerminalEscapeSequence(raw, index); ok {
			index = nextIndex
			continue
		}
		normalized, offsets = appendNormalizedTerminalByte(normalized, offsets, raw[index], index)
	}

	return normalized, offsets
}

func consumeTerminalEscapeSequence(raw []byte, index int) (int, bool) {
	if raw[index] != 0x1b {
		return index, false
	}
	if index+1 >= len(raw) {
		return len(raw), true
	}

	switch raw[index+1] {
	case '[':
		return consumeTerminalCSISequence(raw, index+2), true
	case ']':
		return consumeTerminalOSCSequence(raw, index+2), true
	default:
		return index + 1, true
	}
}

func consumeTerminalCSISequence(raw []byte, index int) int {
	for index < len(raw) {
		if raw[index] >= 0x40 && raw[index] <= 0x7e {
			return index
		}
		index++
	}
	return index
}

func consumeTerminalOSCSequence(raw []byte, index int) int {
	for index < len(raw) {
		if raw[index] == 0x07 {
			return index
		}
		if raw[index] == 0x1b && index+1 < len(raw) && raw[index+1] == '\\' {
			return index + 1
		}
		index++
	}
	return index
}

func appendNormalizedTerminalByte(normalized []byte, offsets []int, current byte, index int) ([]byte, []int) {
	switch {
	case current == '\b':
		if len(normalized) > 0 {
			normalized = normalized[:len(normalized)-1]
			offsets = offsets[:len(offsets)-1]
		}
	case current == '\r':
		return normalized, offsets
	case current < 0x20 && current != '\n' && current != '\t':
		return normalized, offsets
	default:
		normalized = append(normalized, current)
		offsets = append(offsets, index+1)
	}
	return normalized, offsets
}

func (session *session) clearPromptReadyState() {
	session.mu.Lock()
	session.promptReadyMarker = ""
	session.promptReadyActive = false
	session.promptReadyAwaitingVisibleOutput = false
	session.promptReadyBuffer = nil
	session.mu.Unlock()
}

func (session *session) setPromptReadyActive(active bool) {
	session.mu.Lock()
	session.promptReadyActive = active
	session.mu.Unlock()
}

func (session *session) setPendingPromptInput(pending bool) {
	session.mu.Lock()
	session.pendingPromptInput = pending
	session.mu.Unlock()
}

func (session *session) takePendingPromptInput() bool {
	session.mu.Lock()
	pending := session.pendingPromptInput
	session.pendingPromptInput = false
	session.mu.Unlock()
	return pending
}

func (session *session) consumePreAttachBackendRunNormalization() bool {
	session.mu.Lock()
	defer session.mu.Unlock()

	if !session.managedDefaultShell || session.attachedOnce || session.preAttachBackendRunNormalized {
		return false
	}
	session.preAttachBackendRunNormalized = true
	return true
}

func (session *session) enqueueRunCommandUntilInitialResize(data []byte) bool {
	session.mu.Lock()
	defer session.mu.Unlock()

	if !session.managedDefaultShell || session.initialSizeSynced {
		return false
	}
	commandCopy := append([]byte(nil), data...)
	session.pendingRunCommands = append(session.pendingRunCommands, commandCopy)
	return true
}

func (session *session) applyResize(columns int, rows int) [][]byte {
	session.mu.Lock()
	defer session.mu.Unlock()

	session.columns = columns
	session.rows = rows
	if session.initialSizeSynced {
		return nil
	}
	session.initialSizeSynced = true
	if len(session.pendingRunCommands) == 0 {
		return nil
	}
	pending := append([][]byte(nil), session.pendingRunCommands...)
	session.pendingRunCommands = nil
	return pending
}
