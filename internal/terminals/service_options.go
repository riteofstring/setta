package terminals

import (
	"fmt"
	"strings"
)

func (s *Service) normalizeOpenOptions(options OpenOptions) (OpenOptions, error) {
	options.ID = strings.TrimSpace(options.ID)
	options.ProjectID = strings.TrimSpace(options.ProjectID)
	options.ShareSessionID = strings.TrimSpace(options.ShareSessionID)
	options.Dir = strings.TrimSpace(options.Dir)

	if options.ID == "" {
		return OpenOptions{}, fmt.Errorf("terminal id is required")
	}
	if options.ProjectID == "" {
		return OpenOptions{}, fmt.Errorf("project id is required")
	}
	if options.Columns < 1 {
		options.Columns = defaultColumns
	}
	if options.Rows < 1 {
		options.Rows = defaultRows
	}

	if len(options.Command) == 0 {
		options.Command = append([]string(nil), s.defaultCommand...)
	} else {
		options.Command = append([]string(nil), options.Command...)
	}
	if len(options.Command) == 0 {
		return OpenOptions{}, fmt.Errorf("terminal command is required")
	}

	resolvedCommand, err := resolveCommand(options.Command)
	if err != nil {
		return OpenOptions{}, err
	}
	options.Command = resolvedCommand
	options.Env = append([]string(nil), options.Env...)
	return options, nil
}

func (session *session) info() SessionInfo {
	session.mu.RLock()
	defer session.mu.RUnlock()
	return SessionInfo{
		ID:             session.id,
		ProjectID:      session.projectID,
		ShareSessionID: session.shareSessionID,
		AllowInput:     session.allowInput,
		Columns:        session.columns,
		Rows:           session.rows,
		CreatedAt:      session.createdAt,
	}
}

func (session *session) matches(options OpenOptions) bool {
	if session.projectID != options.ProjectID {
		return false
	}
	if session.shareSessionID != options.ShareSessionID {
		return false
	}
	if session.allowInput != options.AllowInput {
		return false
	}
	if session.dir != options.Dir {
		return false
	}
	if !equalStringSlices(session.command, options.Command) {
		return false
	}
	return equalStringSlices(session.env, options.Env)
}

func (session *session) isExited() bool {
	session.mu.RLock()
	defer session.mu.RUnlock()
	return session.exited
}

func (session *session) markExited() {
	session.mu.Lock()
	session.exited = true
	session.mu.Unlock()
}

func (session *session) appendOutput(data []byte) {
	if len(data) == 0 {
		return
	}

	session.mu.Lock()
	session.history.Append(data)
	staleAttachmentIDs := make([]string, 0)
	for attachmentID, output := range session.attachments {
		chunk := append([]byte(nil), data...)
		select {
		case output <- chunk:
		default:
			staleAttachmentIDs = append(staleAttachmentIDs, attachmentID)
		}
	}
	session.mu.Unlock()

	if len(staleAttachmentIDs) > 0 {
		session.removeAttachments(staleAttachmentIDs)
	}
}

func (session *session) removeAttachments(attachmentIDs []string) {
	if len(attachmentIDs) == 0 {
		return
	}

	session.mu.Lock()
	channels := make([]chan []byte, 0, len(attachmentIDs))
	for _, attachmentID := range attachmentIDs {
		output, ok := session.attachments[attachmentID]
		if !ok {
			continue
		}
		delete(session.attachments, attachmentID)
		channels = append(channels, output)
	}
	session.mu.Unlock()

	for _, output := range channels {
		close(output)
	}
}

func (session *session) removeAllAttachments() {
	session.mu.Lock()
	channels := make([]chan []byte, 0, len(session.attachments))
	for attachmentID, output := range session.attachments {
		delete(session.attachments, attachmentID)
		channels = append(channels, output)
	}
	session.mu.Unlock()

	for _, output := range channels {
		close(output)
	}
}

func (h *historyBuffer) Append(data []byte) {
	if len(data) == 0 || h.limit == 0 {
		return
	}

	chunk := append([]byte(nil), data...)
	if len(chunk) > h.limit {
		chunk = append([]byte(nil), chunk[len(chunk)-h.limit:]...)
	}

	h.chunks = append(h.chunks, chunk)
	h.size += len(chunk)
	for h.size > h.limit && len(h.chunks) > 0 {
		h.size -= len(h.chunks[0])
		h.chunks = h.chunks[1:]
	}
}

func (h *historyBuffer) Bytes() []byte {
	if h.size == 0 {
		return nil
	}

	output := make([]byte, 0, h.size)
	for _, chunk := range h.chunks {
		output = append(output, chunk...)
	}
	return output
}
