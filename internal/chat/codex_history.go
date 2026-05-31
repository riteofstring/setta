package chat

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"setta/internal/workspace"
)

const externalCodexConversationIDPrefix = "external_codex_"

var errUnsupportedCodexSession = errors.New("unsupported codex session format")
var codexSessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type CodexHistoryProviderConfig struct {
	RootDir string
}

type CodexHistoryProvider struct {
	rootDir string
}

type codexSessionRecord struct {
	Payload   json.RawMessage `json:"payload"`
	Timestamp string          `json:"timestamp"`
	Type      string          `json:"type"`
}

type codexSessionMetaPayload struct {
	CWD       string `json:"cwd"`
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
}

type codexEventMessagePayload struct {
	Message string `json:"message"`
	Type    string `json:"type"`
}

type codexSessionIndexRecord struct {
	ID         string `json:"id"`
	ThreadName string `json:"thread_name"`
	UpdatedAt  string `json:"updated_at"`
}

func NewCodexHistoryProvider(config CodexHistoryProviderConfig) *CodexHistoryProvider {
	rootDir := strings.TrimSpace(config.RootDir)
	if rootDir == "" {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			rootDir = filepath.Join(homeDir, ".codex")
		}
	}
	return &CodexHistoryProvider{rootDir: filepath.Clean(rootDir)}
}

func (provider *CodexHistoryProvider) ListConversations(workspaceSummary workspace.WorkspaceSummary) ([]ConversationListItem, error) {
	if provider.rootDir == "." || provider.rootDir == "" {
		return []ConversationListItem{}, nil
	}
	index, err := provider.sessionIndex()
	if err != nil {
		return nil, err
	}
	files, err := provider.sessionFiles()
	if err != nil {
		return nil, err
	}
	items := make([]ConversationListItem, 0, len(files))
	for _, file := range files {
		meta, err := readCodexSessionMeta(file)
		if err != nil {
			if errors.Is(err, errUnsupportedCodexSession) {
				continue
			}
			return nil, err
		}
		if filepath.Clean(meta.CWD) != filepath.Clean(workspaceSummary.RootPath) {
			continue
		}
		external, err := provider.loadSessionFile(workspaceSummary, file, meta, index[meta.ID])
		if err != nil {
			return nil, err
		}
		if len(external.Messages) == 0 {
			continue
		}
		items = append(items, ConversationListItem{
			ActiveRunID:  "",
			Conversation: external.Conversation,
			MessageCount: len(external.Messages),
		})
	}
	return sortConversationListItems(items), nil
}

func (provider *CodexHistoryProvider) LoadConversation(workspaceSummary workspace.WorkspaceSummary, conversationID string) (ExternalConversation, error) {
	sessionID, ok := externalCodexSessionID(conversationID)
	if !ok {
		return ExternalConversation{}, fmt.Errorf("not an external codex conversation id: %s", conversationID)
	}
	index, err := provider.sessionIndex()
	if err != nil {
		return ExternalConversation{}, err
	}
	files, err := provider.sessionFiles()
	if err != nil {
		return ExternalConversation{}, err
	}
	for _, file := range files {
		meta, err := readCodexSessionMeta(file)
		if err != nil {
			if errors.Is(err, errUnsupportedCodexSession) {
				continue
			}
			return ExternalConversation{}, err
		}
		if meta.ID != sessionID {
			continue
		}
		if filepath.Clean(meta.CWD) != filepath.Clean(workspaceSummary.RootPath) {
			return ExternalConversation{}, fmt.Errorf("external history %s belongs to %s, not %s", conversationID, meta.CWD, workspaceSummary.RootPath)
		}
		return provider.loadSessionFile(workspaceSummary, file, meta, index[meta.ID])
	}
	return ExternalConversation{}, fmt.Errorf("external history not found: %s", conversationID)
}

func (provider *CodexHistoryProvider) OwnsConversation(conversationID string) bool {
	_, ok := externalCodexSessionID(conversationID)
	return ok
}

func (provider *CodexHistoryProvider) loadSessionFile(
	workspaceSummary workspace.WorkspaceSummary,
	path string,
	meta codexSessionMetaPayload,
	index codexSessionIndexRecord,
) (ExternalConversation, error) {
	messages, updatedAt, err := readCodexSessionMessages(path, externalCodexConversationID(meta.ID))
	if err != nil {
		return ExternalConversation{}, err
	}
	createdAt, err := normalizeCodexTimestamp(firstNonEmpty(meta.Timestamp, updatedAt))
	if err != nil {
		return ExternalConversation{}, err
	}
	updatedAt, err = normalizeCodexTimestamp(firstNonEmpty(index.UpdatedAt, updatedAt, meta.Timestamp))
	if err != nil {
		return ExternalConversation{}, err
	}
	return ExternalConversation{
		Conversation: Conversation{
			SchemaVersion: SchemaVersion,
			ID:            externalCodexConversationID(meta.ID),
			WorkspaceID:   workspaceSummary.ID,
			Title:         codexConversationTitle(index.ThreadName, messages),
			CreatedAt:     createdAt,
			UpdatedAt:     updatedAt,
			ArchivedAt:    "",
			HarnessRefs: []HarnessThreadRef{{
				Harness:        HarnessCodex,
				ThreadID:       meta.ID,
				SessionID:      meta.ID,
				LastTurnID:     "",
				Status:         HarnessRefLinked,
				CreatedAt:      createdAt,
				LastResumedAt:  updatedAt,
				UnavailableMsg: "",
			}},
		},
		Messages: messages,
	}, nil
}

func (provider *CodexHistoryProvider) sessionIndex() (map[string]codexSessionIndexRecord, error) {
	path := filepath.Join(provider.rootDir, "session_index.jsonl")
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]codexSessionIndexRecord{}, nil
		}
		return nil, err
	}
	defer file.Close()

	records := map[string]codexSessionIndexRecord{}
	scanner := newCodexLineScanner(file)
	for scanner.Scan() {
		var record codexSessionIndexRecord
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			return nil, fmt.Errorf("decode codex session index %s: %w", path, err)
		}
		if record.ID != "" {
			records[record.ID] = record
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (provider *CodexHistoryProvider) sessionFiles() ([]string, error) {
	dir := filepath.Join(provider.rootDir, "sessions")
	entries := []string{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".jsonl" {
			return nil
		}
		entries = append(entries, path)
		return nil
	})
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, err
	}
	return entries, nil
}

func readCodexSessionMeta(path string) (codexSessionMetaPayload, error) {
	file, err := os.Open(path)
	if err != nil {
		return codexSessionMetaPayload{}, err
	}
	defer file.Close()

	reader := bufio.NewReader(file)
	line, err := reader.ReadBytes('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return codexSessionMetaPayload{}, err
	}
	var record codexSessionRecord
	if err := json.Unmarshal(line, &record); err != nil {
		return codexSessionMetaPayload{}, fmt.Errorf("decode codex session record %s: %w", path, err)
	}
	if record.Type != "session_meta" {
		return codexSessionMetaPayload{}, fmt.Errorf("%w: first record is %q in %s", errUnsupportedCodexSession, record.Type, path)
	}
	var meta codexSessionMetaPayload
	if err := json.Unmarshal(record.Payload, &meta); err != nil {
		return codexSessionMetaPayload{}, fmt.Errorf("decode codex session meta %s: %w", path, err)
	}
	if meta.ID == "" || meta.CWD == "" {
		return codexSessionMetaPayload{}, fmt.Errorf("codex session %s meta is missing id or cwd", path)
	}
	if meta.Timestamp == "" {
		meta.Timestamp = record.Timestamp
	}
	return meta, nil
}

func readCodexSessionMessages(path string, conversationID string) ([]ChatMessage, string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer file.Close()

	messages := []ChatMessage{}
	latestTimestamp := ""
	reader := bufio.NewReader(file)
	for {
		line, done, err := readCodexSessionLine(reader)
		if err != nil {
			return nil, "", err
		}
		if line == nil && done {
			break
		}
		record, err := decodeCodexSessionRecord(path, line)
		if err != nil {
			return nil, "", err
		}
		if record.Timestamp != "" {
			latestTimestamp = record.Timestamp
		}
		message, ok, err := codexChatMessageFromRecord(path, conversationID, record, len(messages)+1)
		if err != nil {
			return nil, "", err
		}
		if ok {
			messages = append(messages, message)
		}
		if done {
			break
		}
	}
	return messages, latestTimestamp, nil
}

func readCodexSessionLine(reader *bufio.Reader) ([]byte, bool, error) {
	line, err := reader.ReadBytes('\n')
	if err == nil {
		return line, false, nil
	}
	if errors.Is(err, io.EOF) {
		if len(line) == 0 {
			return nil, true, nil
		}
		return line, true, nil
	}
	return nil, false, err
}

func decodeCodexSessionRecord(path string, line []byte) (codexSessionRecord, error) {
	var record codexSessionRecord
	if err := json.Unmarshal(line, &record); err != nil {
		return codexSessionRecord{}, fmt.Errorf("decode codex session record %s: %w", path, err)
	}
	return record, nil
}

func codexChatMessageFromRecord(path string, conversationID string, record codexSessionRecord, ordinal int) (ChatMessage, bool, error) {
	if record.Type != "event_msg" {
		return ChatMessage{}, false, nil
	}
	var payload codexEventMessagePayload
	if err := json.Unmarshal(record.Payload, &payload); err != nil {
		return ChatMessage{}, false, fmt.Errorf("decode codex event message %s: %w", path, err)
	}
	role, ok := codexMessageRole(payload.Type)
	if !ok || strings.TrimSpace(payload.Message) == "" {
		return ChatMessage{}, false, nil
	}
	createdAt, err := normalizeCodexTimestamp(record.Timestamp)
	if err != nil {
		return ChatMessage{}, false, err
	}
	return newCodexChatMessage(conversationID, ordinal, role, payload.Message, createdAt), true, nil
}

func newCodexChatMessage(conversationID string, ordinal int, role string, message string, createdAt string) ChatMessage {
	messageID := fmt.Sprintf("%s_message_%06d", conversationID, ordinal)
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             messageID,
		ConversationID: conversationID,
		RunID:          "",
		Role:           role,
		Ordinal:        ordinal,
		CreatedAt:      createdAt,
		UpdatedAt:      createdAt,
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:     messageID + "_part_1",
			Type:   MessagePartText,
			Text:   message,
			Format: TextFormatMarkdown,
		}},
	}
}

func codexMessageRole(messageType string) (string, bool) {
	switch messageType {
	case "user_message":
		return RoleUser, true
	case "agent_message":
		return RoleAssistant, true
	default:
		return "", false
	}
}

func newCodexLineScanner(reader io.Reader) *bufio.Scanner {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
	return scanner
}

func codexConversationTitle(indexTitle string, messages []ChatMessage) string {
	title := strings.TrimSpace(indexTitle)
	if title != "" {
		return summarize(title, maxConversationTitle)
	}
	for _, message := range messages {
		if message.Role == RoleUser {
			return summarize(message.Parts[0].Text, maxConversationTitle)
		}
	}
	return "External chat history"
}

func normalizeCodexTimestamp(value string) (string, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return "", fmt.Errorf("parse codex history timestamp %q: %w", value, err)
	}
	return timestamp(parsed), nil
}

func externalCodexConversationID(sessionID string) string {
	return externalCodexConversationIDPrefix + sessionID
}

func externalCodexSessionID(conversationID string) (string, bool) {
	sessionID := strings.TrimPrefix(conversationID, externalCodexConversationIDPrefix)
	if sessionID == conversationID || sessionID == "" || !codexSessionIDPattern.MatchString(sessionID) {
		return "", false
	}
	return sessionID, true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
