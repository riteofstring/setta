package chat

import (
	"fmt"
	"path/filepath"
	"slices"
	"time"
)

func validateConversation(conversation Conversation) error {
	if conversation.SchemaVersion != SchemaVersion {
		return fmt.Errorf("conversation %s has unsupported schemaVersion %d", conversation.ID, conversation.SchemaVersion)
	}
	if conversation.ID == "" {
		return fmt.Errorf("conversation id is required")
	}
	if conversation.WorkspaceID == "" {
		return fmt.Errorf("conversation %s workspaceId is required", conversation.ID)
	}
	if conversation.Title == "" {
		return fmt.Errorf("conversation %s title is required", conversation.ID)
	}
	if err := validateTimestamp(conversation.CreatedAt, "conversation "+conversation.ID+" createdAt"); err != nil {
		return err
	}
	if err := validateTimestamp(conversation.UpdatedAt, "conversation "+conversation.ID+" updatedAt"); err != nil {
		return err
	}
	if conversation.ArchivedAt != "" {
		if err := validateTimestamp(conversation.ArchivedAt, "conversation "+conversation.ID+" archivedAt"); err != nil {
			return err
		}
	}
	for _, ref := range conversation.HarnessRefs {
		if err := validateHarnessThreadRef(conversation.ID, ref); err != nil {
			return err
		}
	}
	return nil
}

func validateMessage(message ChatMessage) error {
	if message.SchemaVersion != SchemaVersion {
		return fmt.Errorf("message %s has unsupported schemaVersion %d", message.ID, message.SchemaVersion)
	}
	if err := validateMessageIdentity(message); err != nil {
		return err
	}
	if err := validateMessageState(message); err != nil {
		return err
	}
	if len(message.Parts) == 0 {
		return fmt.Errorf("message %s must contain at least one part", message.ID)
	}
	for _, part := range message.Parts {
		if err := validateMessagePart(message.ID, part); err != nil {
			return err
		}
	}
	return nil
}

func validateMessageIdentity(message ChatMessage) error {
	if message.ID == "" {
		return fmt.Errorf("message id is required")
	}
	if message.ConversationID == "" {
		return fmt.Errorf("message %s conversationId is required", message.ID)
	}
	if !validString(message.Role, []string{RoleUser, RoleAssistant, RoleSystem, RoleDeveloper, RoleTool}) {
		return fmt.Errorf("message %s has unsupported role %s", message.ID, message.Role)
	}
	if message.Ordinal <= 0 {
		return fmt.Errorf("message %s ordinal must be positive", message.ID)
	}
	return nil
}

func validateMessageState(message ChatMessage) error {
	if err := validateTimestamp(message.CreatedAt, "message "+message.ID+" createdAt"); err != nil {
		return err
	}
	if err := validateTimestamp(message.UpdatedAt, "message "+message.ID+" updatedAt"); err != nil {
		return err
	}
	if !validString(message.Status, []string{MessageStatusPending, MessageStatusStreaming, MessageStatusComplete, MessageStatusCancelled, MessageStatusError}) {
		return fmt.Errorf("message %s has unsupported status %s", message.ID, message.Status)
	}
	return nil
}

func validateMessagePart(messageID string, part MessagePart) error {
	if part.ID == "" {
		return fmt.Errorf("message %s part id is required", messageID)
	}
	if part.Type != MessagePartText {
		return fmt.Errorf("message %s part %s has unsupported type %s", messageID, part.ID, part.Type)
	}
	if !validString(part.Format, []string{TextFormatPlain, TextFormatMarkdown}) {
		return fmt.Errorf("message %s part %s has unsupported format %s", messageID, part.ID, part.Format)
	}
	return nil
}

func validateHarnessThreadRef(conversationID string, ref HarnessThreadRef) error {
	if ref.Harness == "" {
		return fmt.Errorf("conversation %s harness ref harness is required", conversationID)
	}
	if ref.ThreadID == "" {
		return fmt.Errorf("conversation %s harness ref threadId is required", conversationID)
	}
	if !validString(ref.Status, []string{HarnessRefLinked, HarnessRefMissing, HarnessRefStale, HarnessRefUnsupported}) {
		return fmt.Errorf("conversation %s harness ref has unsupported status %s", conversationID, ref.Status)
	}
	if err := validateTimestamp(ref.CreatedAt, "conversation "+conversationID+" harness ref createdAt"); err != nil {
		return err
	}
	if ref.LastResumedAt != "" {
		if err := validateTimestamp(ref.LastResumedAt, "conversation "+conversationID+" harness ref lastResumedAt"); err != nil {
			return err
		}
	}
	return nil
}

func validateRun(run Run) error {
	if run.SchemaVersion != SchemaVersion {
		return fmt.Errorf("run %s has unsupported schemaVersion %d", run.ID, run.SchemaVersion)
	}
	if err := validateRunIdentity(run); err != nil {
		return err
	}
	if err := validateRunState(run); err != nil {
		return err
	}
	if run.HasPendingApproval {
		if err := validateApprovalRequest(run.PendingApproval); err != nil {
			return err
		}
	}
	return nil
}

func validateRunIdentity(run Run) error {
	if run.ID == "" {
		return fmt.Errorf("run id is required")
	}
	if run.WorkspaceID == "" {
		return fmt.Errorf("run %s workspaceId is required", run.ID)
	}
	if run.ConversationID == "" {
		return fmt.Errorf("run %s conversationId is required", run.ID)
	}
	if run.TriggerMessageID == "" {
		return fmt.Errorf("run %s triggerMessageId is required", run.ID)
	}
	if run.Harness == "" {
		return fmt.Errorf("run %s harness is required", run.ID)
	}
	return nil
}

func validateRunState(run Run) error {
	if !validString(run.Status, []string{RunStatusQueued, RunStatusRunning, RunStatusCompleted, RunStatusCancelled, RunStatusFailed}) {
		return fmt.Errorf("run %s has unsupported status %s", run.ID, run.Status)
	}
	if err := validateTimestamp(run.StartedAt, "run "+run.ID+" startedAt"); err != nil {
		return err
	}
	if run.CompletedAt != "" {
		if err := validateTimestamp(run.CompletedAt, "run "+run.ID+" completedAt"); err != nil {
			return err
		}
	}
	return nil
}

func validateApprovalRequest(approval ApprovalRequest) error {
	if err := validateApprovalIdentity(approval); err != nil {
		return err
	}
	if err := validateApprovalState(approval); err != nil {
		return err
	}
	for _, question := range approval.Questions {
		if err := validateApprovalQuestion(approval.ID, question); err != nil {
			return err
		}
	}
	return nil
}

func validateApprovalIdentity(approval ApprovalRequest) error {
	if approval.ID == "" {
		return fmt.Errorf("approval id is required")
	}
	if approval.RunID == "" {
		return fmt.Errorf("approval %s runId is required", approval.ID)
	}
	if !validString(approval.Kind, []string{ApprovalKindCommand, ApprovalKindFileChange, ApprovalKindPermission, ApprovalKindUserInput}) {
		return fmt.Errorf("approval %s has unsupported kind %s", approval.ID, approval.Kind)
	}
	if approval.Title == "" {
		return fmt.Errorf("approval %s title is required", approval.ID)
	}
	return nil
}

func validateApprovalState(approval ApprovalRequest) error {
	if !validString(approval.Status, []string{ApprovalStatusPending, ApprovalStatusApproved, ApprovalStatusDenied, ApprovalStatusAnswered, ApprovalStatusCancelled}) {
		return fmt.Errorf("approval %s has unsupported status %s", approval.ID, approval.Status)
	}
	if err := validateTimestamp(approval.CreatedAt, "approval "+approval.ID+" createdAt"); err != nil {
		return err
	}
	if approval.ResolvedAt != "" {
		if err := validateTimestamp(approval.ResolvedAt, "approval "+approval.ID+" resolvedAt"); err != nil {
			return err
		}
	}
	if approval.FilePath != "" && !filepath.IsAbs(approval.FilePath) {
		return fmt.Errorf("approval %s filePath must be absolute", approval.ID)
	}
	return nil
}

func validateApprovalQuestion(approvalID string, question ApprovalQuestion) error {
	if question.ID == "" {
		return fmt.Errorf("approval %s question id is required", approvalID)
	}
	if question.Question == "" {
		return fmt.Errorf("approval %s question %s text is required", approvalID, question.ID)
	}
	return nil
}

func validateTraceEvent(trace TraceEvent) error {
	if trace.SchemaVersion != SchemaVersion {
		return fmt.Errorf("trace %s has unsupported schemaVersion %d", trace.ID, trace.SchemaVersion)
	}
	if trace.ID == "" {
		return fmt.Errorf("trace id is required")
	}
	if trace.RunID == "" {
		return fmt.Errorf("trace %s runId is required", trace.ID)
	}
	if trace.Type == "" {
		return fmt.Errorf("trace %s type is required", trace.ID)
	}
	if err := validateTimestamp(trace.CreatedAt, "trace "+trace.ID+" createdAt"); err != nil {
		return err
	}
	return nil
}

func validateTimestamp(value string, label string) error {
	if _, err := time.Parse(time.RFC3339Nano, value); err != nil {
		return fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	return nil
}

func validString(value string, values []string) bool {
	return slices.Contains(values, value)
}
