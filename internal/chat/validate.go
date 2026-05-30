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
	if !validValue(message.Role, messageRoleValues) {
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
	if !validValue(message.Status, messageStatusValues) {
		return fmt.Errorf("message %s has unsupported status %s", message.ID, message.Status)
	}
	if !validValue(message.Delivery, messageDeliveryValues) {
		return fmt.Errorf("message %s has unsupported delivery %s", message.ID, message.Delivery)
	}
	if message.Role != RoleUser && message.Delivery != MessageDeliveryNormal {
		return fmt.Errorf("message %s non-user role %s must use normal delivery", message.ID, message.Role)
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
	if !validValue(part.Format, textFormatValues) {
		return fmt.Errorf("message %s part %s has unsupported format %s", messageID, part.ID, part.Format)
	}
	return nil
}

func validateHarnessThreadRef(conversationID string, ref HarnessThreadRef) error {
	if ref.Harness == "" {
		return fmt.Errorf("conversation %s harness ref harness is required", conversationID)
	}
	if !validValue(ref.Harness, harnessKindValues) {
		return fmt.Errorf("conversation %s harness ref has unsupported harness %s", conversationID, ref.Harness)
	}
	if ref.ThreadID == "" {
		return fmt.Errorf("conversation %s harness ref threadId is required", conversationID)
	}
	if !validValue(ref.Status, harnessRefStatusValues) {
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
	if run.Status == RunStatusQueued {
		if run.AssistantMessageID != "" {
			return fmt.Errorf("queued run %s assistantMessageId must be empty", run.ID)
		}
	} else if run.AssistantMessageID == "" {
		return fmt.Errorf("run %s assistantMessageId is required unless queued", run.ID)
	}
	if run.Harness == "" {
		return fmt.Errorf("run %s harness is required", run.ID)
	}
	if !validValue(run.Harness, harnessKindValues) {
		return fmt.Errorf("run %s has unsupported harness %s", run.ID, run.Harness)
	}
	return nil
}

func validateRunState(run Run) error {
	if !validValue(run.Status, runStatusValues) {
		return fmt.Errorf("run %s has unsupported status %s", run.ID, run.Status)
	}
	if run.StartedAt == "" {
		if run.Status != RunStatusQueued {
			return fmt.Errorf("run %s startedAt is required unless queued", run.ID)
		}
	} else {
		if err := validateTimestamp(run.StartedAt, "run "+run.ID+" startedAt"); err != nil {
			return err
		}
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
	if !validValue(approval.Kind, approvalKindValues) {
		return fmt.Errorf("approval %s has unsupported kind %s", approval.ID, approval.Kind)
	}
	if approval.Title == "" {
		return fmt.Errorf("approval %s title is required", approval.ID)
	}
	return nil
}

func validateApprovalState(approval ApprovalRequest) error {
	if !validValue(approval.Status, approvalStatusValues) {
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

func validateDiagnostic(diagnostic Diagnostic) error {
	if diagnostic.SchemaVersion != SchemaVersion {
		return fmt.Errorf("diagnostic %s has unsupported schemaVersion %d", diagnostic.ID, diagnostic.SchemaVersion)
	}
	if diagnostic.ID == "" {
		return fmt.Errorf("diagnostic id is required")
	}
	if !validValue(diagnostic.Source, diagnosticSourceValues) {
		return fmt.Errorf("diagnostic %s has unsupported source %s", diagnostic.ID, diagnostic.Source)
	}
	if !validValue(diagnostic.Severity, diagnosticSeverityValues) {
		return fmt.Errorf("diagnostic %s has unsupported severity %s", diagnostic.ID, diagnostic.Severity)
	}
	if diagnostic.Code == "" {
		return fmt.Errorf("diagnostic %s code is required", diagnostic.ID)
	}
	if diagnostic.Message == "" {
		return fmt.Errorf("diagnostic %s message is required", diagnostic.ID)
	}
	if err := validateTimestamp(diagnostic.OccurredAt, "diagnostic "+diagnostic.ID+" occurredAt"); err != nil {
		return err
	}
	if diagnostic.Context == nil {
		return fmt.Errorf("diagnostic %s context is required", diagnostic.ID)
	}
	return nil
}

func validateRunItem(item RunItem) error {
	if item.SchemaVersion != SchemaVersion {
		return fmt.Errorf("run item %s has unsupported schemaVersion %d", item.ID, item.SchemaVersion)
	}
	if err := validateRunItemIdentity(item); err != nil {
		return err
	}
	if err := validateRunItemTypeAndStatus(item); err != nil {
		return err
	}
	if err := validateRunItemTimestamps(item); err != nil {
		return err
	}
	if item.ExitCode < 0 {
		return fmt.Errorf("run item %s exitCode must be non-negative", item.ID)
	}
	if item.DurationMs < 0 {
		return fmt.Errorf("run item %s durationMs must be non-negative", item.ID)
	}
	return nil
}

func validateRunItemIdentity(item RunItem) error {
	if item.ID == "" {
		return fmt.Errorf("run item id is required")
	}
	if item.WorkspaceID == "" {
		return fmt.Errorf("run item %s workspaceId is required", item.ID)
	}
	if item.ConversationID == "" {
		return fmt.Errorf("run item %s conversationId is required", item.ID)
	}
	if item.RunID == "" {
		return fmt.Errorf("run item %s runId is required", item.ID)
	}
	if item.ProviderItemID == "" {
		return fmt.Errorf("run item %s providerItemId is required", item.ID)
	}
	return nil
}

func validateRunItemTypeAndStatus(item RunItem) error {
	if !validValue(item.Type, runItemTypeValues) {
		return fmt.Errorf("run item %s has unsupported type %s", item.ID, item.Type)
	}
	if !validValue(item.Status, runItemStatusValues) {
		return fmt.Errorf("run item %s has unsupported status %s", item.ID, item.Status)
	}
	return nil
}

func validateRunItemTimestamps(item RunItem) error {
	if err := validateTimestamp(item.CreatedAt, "run item "+item.ID+" createdAt"); err != nil {
		return err
	}
	if item.StartedAt != "" {
		if err := validateTimestamp(item.StartedAt, "run item "+item.ID+" startedAt"); err != nil {
			return err
		}
	}
	if item.CompletedAt != "" {
		if err := validateTimestamp(item.CompletedAt, "run item "+item.ID+" completedAt"); err != nil {
			return err
		}
	}
	return nil
}

func validateRunItemOutput(output RunItemOutput) error {
	if output.SchemaVersion != SchemaVersion {
		return fmt.Errorf("run item output %s has unsupported schemaVersion %d", output.ID, output.SchemaVersion)
	}
	if output.ID == "" {
		return fmt.Errorf("run item output id is required")
	}
	if output.RunItemID == "" {
		return fmt.Errorf("run item output %s runItemId is required", output.ID)
	}
	if output.Stream == "" {
		return fmt.Errorf("run item output %s stream is required", output.ID)
	}
	if output.Ordinal <= 0 {
		return fmt.Errorf("run item output %s ordinal must be positive", output.ID)
	}
	if output.Text == "" {
		return fmt.Errorf("run item output %s text is required", output.ID)
	}
	if err := validateTimestamp(output.CreatedAt, "run item output "+output.ID+" createdAt"); err != nil {
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

func validValue[T comparable](value T, values []T) bool {
	return slices.Contains(values, value)
}
