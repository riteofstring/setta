package chat

import (
	"fmt"
	"path/filepath"
	"slices"
	"time"
)

func validateConversation(conversation Conversation) error {
	if err := validateConversationIdentity(conversation); err != nil {
		return err
	}
	if err := validateConversationTimestamps(conversation); err != nil {
		return err
	}
	for _, ref := range conversation.HarnessRefs {
		if err := validateHarnessThreadRef(conversation.ID, ref); err != nil {
			return err
		}
	}
	if conversation.CodexSettings != nil {
		if err := validateChatCodexSettings(conversation.ID, *conversation.CodexSettings); err != nil {
			return err
		}
	}
	if conversation.CodexEffectiveSettings != nil {
		if err := validateChatCodexEffectiveSettings(conversation.ID, *conversation.CodexEffectiveSettings); err != nil {
			return err
		}
	}
	if err := validateConversationWorkflowMetadata(conversation); err != nil {
		return err
	}
	return nil
}

func validateConversationIdentity(conversation Conversation) error {
	if conversation.SchemaVersion != SchemaVersion {
		return fmt.Errorf("conversation %s has unsupported schemaVersion %d", conversation.ID, conversation.SchemaVersion)
	}
	if conversation.ID == "" {
		return fmt.Errorf("conversation id is required")
	}
	if err := validateConversationID(conversation.ID); err != nil {
		return err
	}
	if conversation.WorkspaceID == "" {
		return fmt.Errorf("conversation %s workspaceId is required", conversation.ID)
	}
	if err := validateWorkspaceID(conversation.WorkspaceID); err != nil {
		return fmt.Errorf("conversation %s %w", conversation.ID, err)
	}
	if conversation.Title == "" {
		return fmt.Errorf("conversation %s title is required", conversation.ID)
	}
	return nil
}

func validateConversationTimestamps(conversation Conversation) error {
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
	return nil
}

func emptyConversationReadState(conversationID string) ConversationReadState {
	return ConversationReadState{
		SchemaVersion:            SchemaVersion,
		ConversationID:           conversationID,
		ReadMarker:               0,
		LatestReadRelevantMarker: 0,
		UpdatedAt:                "",
	}
}

func validateConversationReadState(state ConversationReadState, conversationID string) error {
	if state.SchemaVersion != SchemaVersion {
		return fmt.Errorf("conversation read state %s has unsupported schemaVersion %d", state.ConversationID, state.SchemaVersion)
	}
	if state.ConversationID == "" {
		return fmt.Errorf("conversation read state conversationId is required")
	}
	if err := validateConversationID(state.ConversationID); err != nil {
		return err
	}
	if state.ConversationID != conversationID {
		return fmt.Errorf("conversation read state %s does not match requested conversation %s", state.ConversationID, conversationID)
	}
	if state.ReadMarker < 0 {
		return fmt.Errorf("conversation read state %s readMarker must be non-negative", state.ConversationID)
	}
	if state.LatestReadRelevantMarker < 0 {
		return fmt.Errorf("conversation read state %s latestReadRelevantMarker must be non-negative", state.ConversationID)
	}
	if state.ReadMarker > state.LatestReadRelevantMarker {
		return fmt.Errorf("conversation read state %s readMarker exceeds latestReadRelevantMarker", state.ConversationID)
	}
	if state.UpdatedAt != "" {
		if err := validateTimestamp(state.UpdatedAt, "conversation read state "+state.ConversationID+" updatedAt"); err != nil {
			return err
		}
	}
	return nil
}

func validateConversationPinState(state conversationPinState) error {
	if state.SchemaVersion != SchemaVersion {
		return fmt.Errorf("conversation pins have unsupported schemaVersion %d", state.SchemaVersion)
	}
	seen := map[string]bool{}
	for _, pin := range state.Pins {
		if pin.ConversationID == "" {
			return fmt.Errorf("conversation pin conversationId is required")
		}
		if err := validateConversationID(pin.ConversationID); err != nil {
			return err
		}
		if seen[pin.ConversationID] {
			return fmt.Errorf("conversation pin %s is duplicated", pin.ConversationID)
		}
		seen[pin.ConversationID] = true
		if err := validateTimestamp(pin.PinnedAt, "conversation "+pin.ConversationID+" pinnedAt"); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCodexSettings(conversationID string, settings ChatCodexSettings) error {
	if settings.ReasoningEffort != nil && !validValue(*settings.ReasoningEffort, reasoningEffortValues) {
		return fmt.Errorf("conversation %s codexSettings has unsupported reasoning effort %s", conversationID, *settings.ReasoningEffort)
	}
	if settings.Permission != nil {
		if err := validateChatCodexPermissionSettings(conversationID, *settings.Permission); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCodexPermissionSettings(conversationID string, settings ChatCodexPermissionSettings) error {
	preset, ok := chatPermissionPresetByID(settings.Preset)
	if !ok {
		return fmt.Errorf("conversation %s codexSettings permission has unsupported preset %s", conversationID, settings.Preset)
	}
	if settings.ApprovalPolicy == "" {
		return fmt.Errorf("conversation %s codexSettings permission approvalPolicy is required", conversationID)
	}
	if settings.Permissions == "" {
		return fmt.Errorf("conversation %s codexSettings permission permissions is required", conversationID)
	}
	if settings.ApprovalPolicy != preset.ApprovalPolicy || settings.Permissions != preset.ActivePermissionProfileID {
		return fmt.Errorf("conversation %s codexSettings permission preset %s does not match backend preset contract", conversationID, settings.Preset)
	}
	return nil
}

func validateChatCodexEffectiveSettings(conversationID string, settings ChatCodexEffectiveSettings) error {
	if settings.Model == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings model is required", conversationID)
	}
	if settings.ModelDisplayName == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings modelDisplayName is required", conversationID)
	}
	if settings.ReasoningEffort != nil && !validValue(*settings.ReasoningEffort, reasoningEffortValues) {
		return fmt.Errorf("conversation %s codexEffectiveSettings has unsupported reasoning effort %s", conversationID, *settings.ReasoningEffort)
	}
	if settings.ReasoningEffortDisplayName == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings reasoningEffortDisplayName is required", conversationID)
	}
	if settings.Permission != nil {
		if err := validateChatCodexEffectivePermissionSettings(conversationID, *settings.Permission); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCodexEffectivePermissionSettings(conversationID string, settings ChatCodexEffectivePermissionSettings) error {
	if settings.DisplayLabel == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings permission displayLabel is required", conversationID)
	}
	if settings.Preset != nil {
		preset, ok := chatPermissionPresetByID(*settings.Preset)
		if !ok {
			return fmt.Errorf("conversation %s codexEffectiveSettings permission has unsupported preset %s", conversationID, *settings.Preset)
		}
		if settings.ActivePermissionProfileID != preset.ActivePermissionProfileID {
			return fmt.Errorf("conversation %s codexEffectiveSettings permission preset %s does not match activePermissionProfileId", conversationID, *settings.Preset)
		}
		if settings.ApprovalPolicy != preset.ApprovalPolicy {
			return fmt.Errorf("conversation %s codexEffectiveSettings permission preset %s does not match approvalPolicy", conversationID, *settings.Preset)
		}
	}
	if settings.BuiltIn && settings.Preset == nil {
		return fmt.Errorf("conversation %s codexEffectiveSettings permission builtIn requires preset", conversationID)
	}
	return nil
}

func validateConversationWorkflowMetadata(conversation Conversation) error {
	if !conversation.Internal && conversation.Workflow == nil {
		return nil
	}
	if conversation.Workflow == nil {
		return fmt.Errorf("internal conversation %s workflow metadata is required", conversation.ID)
	}
	if err := validateStorageID("workflow definition id", conversation.Workflow.DefinitionID); err != nil {
		return fmt.Errorf("conversation %s %w", conversation.ID, err)
	}
	if err := validateStorageID("workflow definition version id", conversation.Workflow.DefinitionVersionID); err != nil {
		return fmt.Errorf("conversation %s %w", conversation.ID, err)
	}
	if err := validateStorageID("workflow execution id", conversation.Workflow.ExecutionID); err != nil {
		return fmt.Errorf("conversation %s %w", conversation.ID, err)
	}
	if err := validateStorageID("workflow node id", conversation.Workflow.NodeID); err != nil {
		return fmt.Errorf("conversation %s %w", conversation.ID, err)
	}
	if err := validateStorageID("workflow node execution id", conversation.Workflow.NodeExecutionID); err != nil {
		return fmt.Errorf("conversation %s %w", conversation.ID, err)
	}
	return nil
}

func validateChatGoalState(goal ChatGoalState) error {
	if goal.ThreadID == "" {
		return fmt.Errorf("goal threadId is required")
	}
	if _, ok := codexThreadGoalStatuses[goal.Status]; !ok {
		return fmt.Errorf("goal has unsupported status %s", goal.Status)
	}
	if goal.TokenBudget != nil && *goal.TokenBudget < 0 {
		return fmt.Errorf("goal tokenBudget must be non-negative")
	}
	if goal.TokensUsed < 0 {
		return fmt.Errorf("goal tokensUsed must be non-negative")
	}
	if goal.TimeUsedSeconds < 0 {
		return fmt.Errorf("goal timeUsedSeconds must be non-negative")
	}
	if goal.CreatedAt < 0 {
		return fmt.Errorf("goal createdAt must be non-negative")
	}
	if goal.UpdatedAt < 0 {
		return fmt.Errorf("goal updatedAt must be non-negative")
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
	if err := validateMessageID(message.ID); err != nil {
		return err
	}
	if message.ConversationID == "" {
		return fmt.Errorf("message %s conversationId is required", message.ID)
	}
	if err := validateConversationID(message.ConversationID); err != nil {
		return fmt.Errorf("message %s %w", message.ID, err)
	}
	if err := validateOptionalStorageID("run id", message.RunID); err != nil {
		return fmt.Errorf("message %s %w", message.ID, err)
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
	if err := validateStorageID("message part id", part.ID); err != nil {
		return fmt.Errorf("message %s %w", messageID, err)
	}
	switch part.Type {
	case MessagePartText:
		if part.Text == nil {
			return fmt.Errorf("message %s part %s text payload is required", messageID, part.ID)
		}
		if part.Image != nil {
			return fmt.Errorf("message %s part %s image payload must be null for text parts", messageID, part.ID)
		}
		return validateMessageTextPart(messageID, part.ID, *part.Text)
	case MessagePartImage:
		if part.Image == nil {
			return fmt.Errorf("message %s part %s image payload is required", messageID, part.ID)
		}
		if part.Text != nil {
			return fmt.Errorf("message %s part %s text payload must be null for image parts", messageID, part.ID)
		}
		return validateImagePart(messageID, part.ID, *part.Image)
	default:
		return fmt.Errorf("message %s part %s has unsupported type %s", messageID, part.ID, part.Type)
	}
}

func validateMessageTextPart(messageID string, partID string, part MessageTextPart) error {
	if !validValue(part.Format, textFormatValues) {
		return fmt.Errorf("message %s part %s has unsupported format %s", messageID, partID, part.Format)
	}
	return nil
}

func validateImagePart(messageID string, partID string, part ImagePart) error {
	if err := validateStorageID("attachment id", part.AttachmentID); err != nil {
		return fmt.Errorf("message %s part %s %w", messageID, partID, err)
	}
	if part.FileName == "" {
		return fmt.Errorf("message %s part %s fileName is required", messageID, partID)
	}
	if !supportedImageMimeType(part.MimeType) {
		return fmt.Errorf("message %s part %s has unsupported image mimeType %s", messageID, partID, part.MimeType)
	}
	if part.ByteSize <= 0 {
		return fmt.Errorf("message %s part %s byteSize must be positive", messageID, partID)
	}
	if part.Width <= 0 || part.Height <= 0 {
		return fmt.Errorf("message %s part %s dimensions must be positive", messageID, partID)
	}
	if err := validateImagePartVariants(messageID, partID, part); err != nil {
		return err
	}
	if part.Detail != nil && !validValue(*part.Detail, imageDetailValues) {
		return fmt.Errorf("message %s part %s has unsupported image detail %s", messageID, partID, *part.Detail)
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
	if run.PendingApproval != nil {
		if run.Status != RunStatusRunning {
			return fmt.Errorf("run %s has pendingApproval while status is %s", run.ID, run.Status)
		}
		if run.PendingApproval.RunID != run.ID {
			return fmt.Errorf("run %s pendingApproval runId = %s, want %s", run.ID, run.PendingApproval.RunID, run.ID)
		}
		if run.PendingApproval.Status != ApprovalStatusPending {
			return fmt.Errorf("run %s pendingApproval status = %s, want pending", run.ID, run.PendingApproval.Status)
		}
		if err := validateApprovalRequest(*run.PendingApproval); err != nil {
			return err
		}
	}
	return nil
}

func validateRunIdentity(run Run) error {
	if err := validateRunOwnerIdentity(run); err != nil {
		return err
	}
	if err := validateRunMessageRefs(run); err != nil {
		return err
	}
	return validateRunHarness(run)
}

func validateRunOwnerIdentity(run Run) error {
	if run.ID == "" {
		return fmt.Errorf("run id is required")
	}
	if err := validateRunID(run.ID); err != nil {
		return err
	}
	if run.WorkspaceID == "" {
		return fmt.Errorf("run %s workspaceId is required", run.ID)
	}
	if err := validateWorkspaceID(run.WorkspaceID); err != nil {
		return fmt.Errorf("run %s %w", run.ID, err)
	}
	if run.ConversationID == "" {
		return fmt.Errorf("run %s conversationId is required", run.ID)
	}
	if err := validateConversationID(run.ConversationID); err != nil {
		return fmt.Errorf("run %s %w", run.ID, err)
	}
	return nil
}

func validateRunMessageRefs(run Run) error {
	if run.TriggerMessageID == "" {
		return fmt.Errorf("run %s triggerMessageId is required", run.ID)
	}
	if err := validateMessageID(run.TriggerMessageID); err != nil {
		return fmt.Errorf("run %s triggerMessageId: %w", run.ID, err)
	}
	if run.Status == RunStatusQueued {
		if run.AssistantMessageID != "" {
			return fmt.Errorf("queued run %s assistantMessageId must be empty", run.ID)
		}
	} else if run.AssistantMessageID == "" {
		return fmt.Errorf("run %s assistantMessageId is required unless queued", run.ID)
	} else if err := validateMessageID(run.AssistantMessageID); err != nil {
		return fmt.Errorf("run %s assistantMessageId: %w", run.ID, err)
	}
	return nil
}

func validateRunHarness(run Run) error {
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
	if err := validateStorageID("approval id", approval.ID); err != nil {
		return err
	}
	if approval.RunID == "" {
		return fmt.Errorf("approval %s runId is required", approval.ID)
	}
	if err := validateRunID(approval.RunID); err != nil {
		return fmt.Errorf("approval %s %w", approval.ID, err)
	}
	if err := validateOptionalStorageID("run item id", approval.RunItemID); err != nil {
		return fmt.Errorf("approval %s %w", approval.ID, err)
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
	if err := validateStorageID("trace id", trace.ID); err != nil {
		return err
	}
	if trace.RunID == "" {
		return fmt.Errorf("trace %s runId is required", trace.ID)
	}
	if err := validateRunID(trace.RunID); err != nil {
		return fmt.Errorf("trace %s %w", trace.ID, err)
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
	if err := validateDiagnosticIdentity(diagnostic); err != nil {
		return err
	}
	if err := validateDiagnosticScope(diagnostic); err != nil {
		return err
	}
	return validateDiagnosticState(diagnostic)
}

func validateDiagnosticIdentity(diagnostic Diagnostic) error {
	if diagnostic.ID == "" {
		return fmt.Errorf("diagnostic id is required")
	}
	if err := validateStorageID("diagnostic id", diagnostic.ID); err != nil {
		return err
	}
	return nil
}

func validateDiagnosticScope(diagnostic Diagnostic) error {
	if err := validateOptionalStorageID("workspace id", diagnostic.WorkspaceID); err != nil {
		return fmt.Errorf("diagnostic %s %w", diagnostic.ID, err)
	}
	if err := validateOptionalStorageID("conversation id", diagnostic.ConversationID); err != nil {
		return fmt.Errorf("diagnostic %s %w", diagnostic.ID, err)
	}
	if err := validateOptionalStorageID("run id", diagnostic.RunID); err != nil {
		return fmt.Errorf("diagnostic %s %w", diagnostic.ID, err)
	}
	return nil
}

func validateDiagnosticState(diagnostic Diagnostic) error {
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
	if err := validateRunItemDetails(item); err != nil {
		return err
	}
	return nil
}

func validateRunItemIdentity(item RunItem) error {
	if item.ID == "" {
		return fmt.Errorf("run item id is required")
	}
	if err := validateRunItemID(item.ID); err != nil {
		return err
	}
	if item.WorkspaceID == "" {
		return fmt.Errorf("run item %s workspaceId is required", item.ID)
	}
	if err := validateWorkspaceID(item.WorkspaceID); err != nil {
		return fmt.Errorf("run item %s %w", item.ID, err)
	}
	if item.ConversationID == "" {
		return fmt.Errorf("run item %s conversationId is required", item.ID)
	}
	if err := validateConversationID(item.ConversationID); err != nil {
		return fmt.Errorf("run item %s %w", item.ID, err)
	}
	if item.RunID == "" {
		return fmt.Errorf("run item %s runId is required", item.ID)
	}
	if err := validateRunID(item.RunID); err != nil {
		return fmt.Errorf("run item %s %w", item.ID, err)
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
	if item.Source != nil && !validValue(*item.Source, runItemCommandSourceValues) {
		return fmt.Errorf("run item %s has unsupported command source %s", item.ID, *item.Source)
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

func validateRunItemDetails(item RunItem) error {
	if item.Type != RunItemTypeCommandExecution {
		if item.ExitCode < 0 {
			return fmt.Errorf("run item %s exitCode must be non-negative", item.ID)
		}
		if item.DurationMs < 0 {
			return fmt.Errorf("run item %s durationMs must be non-negative", item.ID)
		}
	}
	switch item.Type {
	case RunItemTypeCommandExecution:
		return validateRunItemCommandExecutionDetails(item)
	case RunItemTypeMCPToolCall:
		return validateRunItemMCPToolCallDetailsBranch(item)
	case RunItemTypeDynamicToolCall:
		return validateRunItemDynamicToolCallDetailsBranch(item)
	case RunItemTypeFileChange:
		return validateRunItemFileChangeDetailsBranch(item)
	case RunItemTypeDiff:
		return validateRunItemDiffDetailsBranch(item)
	case RunItemTypeApprovalRequest, RunItemTypeApprovalReview:
		return validateRunItemApprovalDetailsBranch(item)
	default:
		if item.Details != nil {
			return fmt.Errorf("run item %s type %s does not support typed details kind %s", item.ID, item.Type, item.Details.Kind)
		}
		return nil
	}
}

func validateRunItemMCPToolCallDetails(item RunItem, details RunItemMCPToolCallDetails) error {
	if details.DurationMs < 0 {
		return fmt.Errorf("run item %s mcpToolCall durationMs must be non-negative", item.ID)
	}
	if item.Status != RunItemStatusPending && item.Status != RunItemStatusRunning {
		if details.ServerName == "" {
			return fmt.Errorf("run item %s mcpToolCall serverName is required for terminal items", item.ID)
		}
		if details.ToolName == "" {
			return fmt.Errorf("run item %s mcpToolCall toolName is required for terminal items", item.ID)
		}
	}
	return nil
}

func validateRunItemFileChangeDetails(item RunItem, details RunItemFileChangeDetails) error {
	if details.Additions < 0 {
		return fmt.Errorf("run item %s fileChange additions must be non-negative", item.ID)
	}
	if details.Deletions < 0 {
		return fmt.Errorf("run item %s fileChange deletions must be non-negative", item.ID)
	}
	for index, path := range details.Paths {
		if path.Path == "" {
			return fmt.Errorf("run item %s fileChange paths[%d].path is required", item.ID, index)
		}
		if path.Operation != nil && !validValue(*path.Operation, runItemFileChangeOperationValues) {
			return fmt.Errorf("run item %s fileChange paths[%d] has unsupported operation %s", item.ID, index, *path.Operation)
		}
		if path.Additions < 0 {
			return fmt.Errorf("run item %s fileChange paths[%d].additions must be non-negative", item.ID, index)
		}
		if path.Deletions < 0 {
			return fmt.Errorf("run item %s fileChange paths[%d].deletions must be non-negative", item.ID, index)
		}
		if path.PatchTruncated && path.Patch == "" {
			return fmt.Errorf("run item %s fileChange paths[%d].patch is required when patchTruncated is true", item.ID, index)
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
	if err := validateStorageID("run item output id", output.ID); err != nil {
		return err
	}
	if output.RunItemID == "" {
		return fmt.Errorf("run item output %s runItemId is required", output.ID)
	}
	if err := validateRunItemID(output.RunItemID); err != nil {
		return fmt.Errorf("run item output %s %w", output.ID, err)
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

func validateBackgroundTerminalProcess(process BackgroundTerminalProcess) error {
	if process.SchemaVersion != SchemaVersion {
		return fmt.Errorf("background terminal %s has unsupported schemaVersion %d", process.ID, process.SchemaVersion)
	}
	if err := validateBackgroundTerminalIdentity(process); err != nil {
		return err
	}
	if err := validateBackgroundTerminalState(process); err != nil {
		return err
	}
	return validateBackgroundTerminalTimestamps(process)
}

func validateBackgroundTerminalIdentity(process BackgroundTerminalProcess) error {
	if process.ID == "" {
		return fmt.Errorf("background terminal id is required")
	}
	if err := validateStorageID("background terminal id", process.ID); err != nil {
		return err
	}
	if process.WorkspaceID == "" {
		return fmt.Errorf("background terminal %s workspaceId is required", process.ID)
	}
	if err := validateWorkspaceID(process.WorkspaceID); err != nil {
		return fmt.Errorf("background terminal %s %w", process.ID, err)
	}
	if process.ConversationID == "" {
		return fmt.Errorf("background terminal %s conversationId is required", process.ID)
	}
	if err := validateConversationID(process.ConversationID); err != nil {
		return fmt.Errorf("background terminal %s %w", process.ID, err)
	}
	if process.ProviderItemID == "" {
		return fmt.Errorf("background terminal %s providerItemId is required", process.ID)
	}
	if process.ProcessID == "" {
		return fmt.Errorf("background terminal %s processId is required", process.ID)
	}
	if err := validateOptionalStorageID("background terminal threadId", process.ThreadID); err != nil {
		return fmt.Errorf("background terminal %s %w", process.ID, err)
	}
	if err := validateOptionalStorageID("background terminal startedRunId", process.StartedRunID); err != nil {
		return fmt.Errorf("background terminal %s %w", process.ID, err)
	}
	return nil
}

func validateBackgroundTerminalState(process BackgroundTerminalProcess) error {
	if !validValue(process.Source, runItemCommandSourceValues) {
		return fmt.Errorf("background terminal %s has unsupported source %s", process.ID, process.Source)
	}
	if !validValue(process.Status, backgroundTerminalStatusValues) {
		return fmt.Errorf("background terminal %s has unsupported status %s", process.ID, process.Status)
	}
	if process.Command == "" {
		return fmt.Errorf("background terminal %s command is required", process.ID)
	}
	if process.ExitCode < 0 {
		return fmt.Errorf("background terminal %s exitCode must be non-negative", process.ID)
	}
	return nil
}

func validateBackgroundTerminalTimestamps(process BackgroundTerminalProcess) error {
	if err := validateTimestamp(process.StartedAt, "background terminal "+process.ID+" startedAt"); err != nil {
		return err
	}
	if err := validateTimestamp(process.UpdatedAt, "background terminal "+process.ID+" updatedAt"); err != nil {
		return err
	}
	if backgroundTerminalStatusIsTerminal(process.Status) {
		if process.CompletedAt == "" {
			return fmt.Errorf("background terminal %s completedAt is required for terminal status %s", process.ID, process.Status)
		}
	} else if process.CompletedAt != "" {
		return fmt.Errorf("background terminal %s completedAt must be empty for active status %s", process.ID, process.Status)
	}
	if process.CompletedAt != "" {
		if err := validateTimestamp(process.CompletedAt, "background terminal "+process.ID+" completedAt"); err != nil {
			return err
		}
	}
	return nil
}

func validateBackgroundTerminalOutput(output BackgroundTerminalOutput) error {
	if output.SchemaVersion != SchemaVersion {
		return fmt.Errorf("background terminal output %s has unsupported schemaVersion %d", output.ID, output.SchemaVersion)
	}
	if output.ID == "" {
		return fmt.Errorf("background terminal output id is required")
	}
	if err := validateStorageID("background terminal output id", output.ID); err != nil {
		return err
	}
	if output.ProcessID == "" {
		return fmt.Errorf("background terminal output %s processId is required", output.ID)
	}
	if err := validateStorageID("background terminal output processId", output.ProcessID); err != nil {
		return fmt.Errorf("background terminal output %s %w", output.ID, err)
	}
	if output.Stream == "" {
		return fmt.Errorf("background terminal output %s stream is required", output.ID)
	}
	if output.Ordinal <= 0 {
		return fmt.Errorf("background terminal output %s ordinal must be positive", output.ID)
	}
	if output.Text == "" {
		return fmt.Errorf("background terminal output %s text is required", output.ID)
	}
	return validateTimestamp(output.CreatedAt, "background terminal output "+output.ID+" createdAt")
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
