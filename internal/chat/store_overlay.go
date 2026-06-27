package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type SettaThreadSurface string
type ActivityOverlayKind string

const (
	SettaThreadSurfaceUser                 SettaThreadSurface  = "user"
	SettaThreadSurfaceWorkflow             SettaThreadSurface  = "workflow"
	SettaThreadSurfaceSemanticCartographer SettaThreadSurface  = "semantic_cartographer"
	ActivityOverlayKindCommandExecution    ActivityOverlayKind = "command_execution"
	ActivityOverlayKindFileChange          ActivityOverlayKind = "file_change"
	ActivityOverlayKindMCPToolCall         ActivityOverlayKind = "mcp_tool_call"
	ActivityOverlayKindDynamicToolCall     ActivityOverlayKind = "dynamic_tool_call"
	ActivityOverlayKindTerminalInteraction ActivityOverlayKind = "terminal_interaction"
	ActivityOverlayKindApproval            ActivityOverlayKind = "approval"
	ActivityOverlayKindStructuredInput     ActivityOverlayKind = "structured_input"
)

type ThreadIndexRecord struct {
	SchemaVersion            int                           `json:"schemaVersion"`
	WorkspaceID              string                        `json:"workspaceId"`
	CodexThreadID            string                        `json:"codexThreadId"`
	SettaConversationID      string                        `json:"settaConversationId,omitempty"`
	Surface                  SettaThreadSurface            `json:"surface"`
	WorkspaceRoot            string                        `json:"workspaceRoot"`
	CreatedAt                string                        `json:"createdAt"`
	UpdatedAt                string                        `json:"updatedAt"`
	PinnedAt                 string                        `json:"pinnedAt"`
	ReadMarker               int                           `json:"readMarker"`
	LatestReadRelevantMarker int                           `json:"latestReadRelevantMarker"`
	Hidden                   bool                          `json:"hidden"`
	LocalOrder               string                        `json:"localOrder"`
	LastDiscoveredAt         string                        `json:"lastDiscoveredAt"`
	Workflow                 *ConversationWorkflowMetadata `json:"workflow,omitempty"`
	PendingCodexSettings     *ChatCodexSettings            `json:"pendingCodexSettings,omitempty"`
}

type ActivityOverlayRecord struct {
	SchemaVersion int                 `json:"schemaVersion"`
	WorkspaceID   string              `json:"workspaceId"`
	CodexThreadID string              `json:"codexThreadId"`
	CodexTurnID   string              `json:"codexTurnId"`
	LiveKey       string              `json:"liveKey"`
	Kind          ActivityOverlayKind `json:"kind"`
	Status        RunItemStatus       `json:"status"`
	CreatedAt     string              `json:"createdAt"`
	StartedAt     string              `json:"startedAt"`
	CompletedAt   string              `json:"completedAt"`
	Command       string              `json:"command,omitempty"`
	Cwd           string              `json:"cwd,omitempty"`
	ExitCode      int                 `json:"exitCode,omitempty"`
	DurationMs    int                 `json:"durationMs,omitempty"`
	FilePaths     []string            `json:"filePaths,omitempty"`
	PatchStatus   string              `json:"patchStatus,omitempty"`
	ServerName    string              `json:"serverName,omitempty"`
	ToolName      string              `json:"toolName,omitempty"`
	Namespace     string              `json:"namespace,omitempty"`
	RequestID     string              `json:"requestId,omitempty"`
	ReviewID      string              `json:"reviewId,omitempty"`
	Approval      *ApprovalRequest    `json:"approval,omitempty"`
	Details       []byte              `json:"details,omitempty"`
	Error         string              `json:"error,omitempty"`
	Stdout        string              `json:"stdout,omitempty"`
	Stderr        string              `json:"stderr,omitempty"`
	ToolResult    string              `json:"toolResult,omitempty"`
	Progress      string              `json:"progress,omitempty"`
}

func (store *Store) chatOverlayDir(workspaceID string) string {
	return filepath.Join(store.workspaceDir(workspaceID), chatOverlayDirName)
}

func (store *Store) threadOverlayRoot(workspaceID string) string {
	return filepath.Join(store.chatOverlayDir(workspaceID), threadOverlayDirName)
}

func (store *Store) threadOverlayDir(workspaceID string, codexThreadID string) string {
	return filepath.Join(store.threadOverlayRoot(workspaceID), codexThreadID)
}

func (store *Store) threadIndexPath(workspaceID string, codexThreadID string) string {
	return filepath.Join(store.threadOverlayDir(workspaceID, codexThreadID), threadIndexFileName)
}

func (store *Store) threadReadPath(workspaceID string, codexThreadID string) string {
	return filepath.Join(store.threadOverlayDir(workspaceID, codexThreadID), threadReadFileName)
}

func (store *Store) threadPinsPath(workspaceID string) string {
	return filepath.Join(store.chatOverlayDir(workspaceID), threadPinsFileName)
}

func (store *Store) queueOverlayDir(workspaceID string, codexThreadID string) string {
	return filepath.Join(store.threadOverlayDir(workspaceID, codexThreadID), queueOverlayDirName)
}

func (store *Store) queueOverlayPath(workspaceID string, codexThreadID string, queueID string) string {
	return filepath.Join(store.queueOverlayDir(workspaceID, codexThreadID), queueID+".json")
}

func (store *Store) activityOverlayDir(workspaceID string, codexThreadID string, codexTurnID string, liveKey string) string {
	return filepath.Join(store.threadOverlayDir(workspaceID, codexThreadID), activityOverlayDirName, codexTurnID, liveKey)
}

func (store *Store) activityOverlayPath(workspaceID string, codexThreadID string, codexTurnID string, liveKey string) string {
	return filepath.Join(store.activityOverlayDir(workspaceID, codexThreadID, codexTurnID, liveKey), activityRecordFileName)
}

func (store *Store) loadThreadIndexOverlay() error {
	workspacesDir := filepath.Join(store.appDataDir, "workspaces")
	workspaceEntries, err := os.ReadDir(workspacesDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return &PersistenceError{Operation: "list chat overlay workspaces", Path: workspacesDir, Err: err}
	}
	for _, workspaceEntry := range workspaceEntries {
		if !workspaceEntry.IsDir() {
			continue
		}
		workspaceID := workspaceEntry.Name()
		threadRoot := store.threadOverlayRoot(workspaceID)
		threadEntries, err := os.ReadDir(threadRoot)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return &PersistenceError{Operation: "list thread index overlay", Path: threadRoot, Err: err}
		}
		for _, threadEntry := range threadEntries {
			if !threadEntry.IsDir() || strings.HasPrefix(threadEntry.Name(), ".") {
				continue
			}
			if err := store.loadThreadIndexRecord(workspaceID, threadEntry.Name()); err != nil {
				return err
			}
		}
	}
	return nil
}

func (store *Store) loadThreadIndexRecord(workspaceID string, codexThreadID string) error {
	path := store.threadIndexPath(workspaceID, codexThreadID)
	var record ThreadIndexRecord
	if err := readJSONFile(path, &record); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if err := validateThreadIndexRecord(record); err != nil {
		return corruptStateError(path, err)
	}
	store.rememberConversation(conversationFromThreadIndexRecord(record))
	return nil
}

func (store *Store) rememberConversation(conversation Conversation) {
	if store.conversations[conversation.WorkspaceID] == nil {
		store.conversations[conversation.WorkspaceID] = map[string]Conversation{}
	}
	store.conversations[conversation.WorkspaceID][conversation.ID] = conversation
}

func (store *Store) conversationFromMemory(workspaceID string, conversationID string) (Conversation, bool) {
	conversation, ok := store.conversations[workspaceID][conversationID]
	return conversation, ok
}

func (store *Store) conversationsFromMemory(workspaceID string) []Conversation {
	byID := store.conversations[workspaceID]
	conversations := make([]Conversation, 0, len(byID))
	for _, conversation := range byID {
		conversations = append(conversations, conversation)
	}
	sortConversations(conversations)
	return conversations
}

func threadIndexRecordFromConversation(conversation Conversation, codexThreadID string) ThreadIndexRecord {
	return ThreadIndexRecord{
		SchemaVersion:        SchemaVersion,
		WorkspaceID:          conversation.WorkspaceID,
		CodexThreadID:        codexThreadID,
		SettaConversationID:  conversation.ID,
		Surface:              surfaceFromConversation(conversation),
		WorkspaceRoot:        workspaceRootFromConversation(conversation),
		CreatedAt:            conversation.CreatedAt,
		UpdatedAt:            conversation.UpdatedAt,
		Hidden:               conversation.Internal && conversation.Workflow == nil,
		Workflow:             conversation.Workflow,
		PendingCodexSettings: conversation.CodexSettings,
	}
}

func conversationFromThreadIndexRecord(record ThreadIndexRecord) Conversation {
	internal := record.Surface != SettaThreadSurfaceUser
	title := "New chat"
	if record.Surface == SettaThreadSurfaceWorkflow {
		title = "Workflow agent"
	}
	if record.Surface == SettaThreadSurfaceSemanticCartographer {
		title = "Semantic cartographer"
	}
	conversationID := record.SettaConversationID
	if conversationID == "" {
		conversationID = record.CodexThreadID
	}
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            conversationID,
		WorkspaceID:   record.WorkspaceID,
		Title:         title,
		Internal:      internal,
		CreatedAt:     record.CreatedAt,
		UpdatedAt:     record.UpdatedAt,
		CodexSettings: record.PendingCodexSettings,
		HarnessRefs: []HarnessThreadRef{{
			Harness:       HarnessCodex,
			ThreadID:      record.CodexThreadID,
			Status:        HarnessRefLinked,
			CreatedAt:     record.CreatedAt,
			LastResumedAt: record.UpdatedAt,
		}},
		Workflow: record.Workflow,
	}
}

func surfaceFromConversation(conversation Conversation) SettaThreadSurface {
	if !conversation.Internal {
		return SettaThreadSurfaceUser
	}
	if conversation.Workflow != nil {
		return SettaThreadSurfaceWorkflow
	}
	return SettaThreadSurfaceSemanticCartographer
}

func workspaceRootFromConversation(conversation Conversation) string {
	ref := latestHarnessRef(conversation, HarnessCodex)
	if ref.SessionID != "" {
		return ref.SessionID
	}
	return conversation.WorkspaceID
}

func validateThreadIndexRecord(record ThreadIndexRecord) error {
	if record.SchemaVersion != SchemaVersion {
		return fmt.Errorf("thread index %s has unsupported schemaVersion %d", record.CodexThreadID, record.SchemaVersion)
	}
	if record.WorkspaceID == "" {
		return fmt.Errorf("thread index workspaceId is required")
	}
	if err := validateWorkspaceID(record.WorkspaceID); err != nil {
		return err
	}
	if record.CodexThreadID == "" {
		return fmt.Errorf("thread index codexThreadId is required")
	}
	if err := validateConversationID(record.CodexThreadID); err != nil {
		return err
	}
	if record.SettaConversationID != "" {
		if err := validateConversationID(record.SettaConversationID); err != nil {
			return err
		}
	}
	switch record.Surface {
	case SettaThreadSurfaceUser, SettaThreadSurfaceWorkflow, SettaThreadSurfaceSemanticCartographer:
	default:
		return fmt.Errorf("thread index %s has unsupported surface %s", record.CodexThreadID, record.Surface)
	}
	if strings.TrimSpace(record.WorkspaceRoot) == "" {
		return fmt.Errorf("thread index %s workspaceRoot is required", record.CodexThreadID)
	}
	if err := validateTimestamp(record.CreatedAt, "thread index "+record.CodexThreadID+" createdAt"); err != nil {
		return err
	}
	if err := validateTimestamp(record.UpdatedAt, "thread index "+record.CodexThreadID+" updatedAt"); err != nil {
		return err
	}
	if record.PinnedAt != "" {
		if err := validateTimestamp(record.PinnedAt, "thread index "+record.CodexThreadID+" pinnedAt"); err != nil {
			return err
		}
	}
	if record.ReadMarker < 0 || record.LatestReadRelevantMarker < 0 || record.ReadMarker > record.LatestReadRelevantMarker {
		return fmt.Errorf("thread index %s has invalid read markers", record.CodexThreadID)
	}
	if record.Workflow != nil {
		conversation := conversationFromThreadIndexRecord(record)
		if err := validateConversationWorkflowMetadata(conversation); err != nil {
			return err
		}
	}
	return validateOverlayDoesNotContainTranscriptText("thread index "+record.CodexThreadID, record)
}

func validateActivityOverlayRecord(record ActivityOverlayRecord) error {
	if record.SchemaVersion != SchemaVersion {
		return fmt.Errorf("activity overlay %s has unsupported schemaVersion %d", record.LiveKey, record.SchemaVersion)
	}
	if record.WorkspaceID == "" || record.CodexThreadID == "" || record.CodexTurnID == "" || record.LiveKey == "" {
		return fmt.Errorf("activity overlay identity is required")
	}
	if err := validateWorkspaceID(record.WorkspaceID); err != nil {
		return err
	}
	if err := validateConversationID(record.CodexThreadID); err != nil {
		return err
	}
	if err := validateRunID(record.CodexTurnID); err != nil {
		return err
	}
	if !validValue(record.Status, runItemStatusValues) {
		return fmt.Errorf("activity overlay %s has unsupported status %s", record.LiveKey, record.Status)
	}
	if record.CreatedAt != "" {
		if err := validateTimestamp(record.CreatedAt, "activity overlay "+record.LiveKey+" createdAt"); err != nil {
			return err
		}
	}
	if record.StartedAt != "" {
		if err := validateTimestamp(record.StartedAt, "activity overlay "+record.LiveKey+" startedAt"); err != nil {
			return err
		}
	}
	if record.CompletedAt != "" {
		if err := validateTimestamp(record.CompletedAt, "activity overlay "+record.LiveKey+" completedAt"); err != nil {
			return err
		}
	}
	switch record.Kind {
	case ActivityOverlayKindCommandExecution,
		ActivityOverlayKindFileChange,
		ActivityOverlayKindMCPToolCall,
		ActivityOverlayKindDynamicToolCall,
		ActivityOverlayKindTerminalInteraction,
		ActivityOverlayKindApproval,
		ActivityOverlayKindStructuredInput:
	default:
		return fmt.Errorf("activity overlay %s has unsupported kind %s", record.LiveKey, record.Kind)
	}
	return validateOverlayDoesNotContainTranscriptText("activity overlay "+record.LiveKey, record)
}

func validateOverlayDoesNotContainTranscriptText(label string, value any) error {
	encoded, err := jsonMarshalForOverlayValidation(value)
	if err != nil {
		return err
	}
	for _, field := range []string{"\"title\"", "\"summary\"", "\"text\"", "\"promptSummary\"", "\"messages\"", "\"transcript\""} {
		if strings.Contains(encoded, field) {
			return fmt.Errorf("%s must not contain transcript field %s", label, field)
		}
	}
	return nil
}

func jsonMarshalForOverlayValidation(value any) (string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func sortConversations(conversations []Conversation) {
	sort.SliceStable(conversations, func(left int, right int) bool {
		if conversations[left].UpdatedAt == conversations[right].UpdatedAt {
			return conversations[left].ID < conversations[right].ID
		}
		return conversations[left].UpdatedAt > conversations[right].UpdatedAt
	})
}
