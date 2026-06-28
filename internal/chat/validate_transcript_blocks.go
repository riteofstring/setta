package chat

import "fmt"

// validatePersistedTranscriptBlock applies the structural contract plus the
// persistence-only invariant that the live-only working run_status indicator is
// never written to or read from disk. validateTranscriptBlock itself accepts a
// working block because it is a valid in-memory live-tail projection; only
// persisted blocks must reject it.
func validatePersistedTranscriptBlock(block TranscriptBlock) error {
	if err := validateTranscriptBlock(block); err != nil {
		return err
	}
	if block.Kind == TranscriptBlockKindRunStatus && block.RunStatus.Mode == RunStatusBlockModeWorking {
		return fmt.Errorf("transcript block %s run_status mode %q is live-only and must not be persisted", block.ID, RunStatusBlockModeWorking)
	}
	return nil
}

func validateTranscriptBlock(block TranscriptBlock) error {
	if block.SchemaVersion != SchemaVersion {
		return fmt.Errorf("transcript block %s has unsupported schemaVersion %d", block.ID, block.SchemaVersion)
	}
	if err := validateTranscriptBlockIdentity(block); err != nil {
		return err
	}
	if err := validateTranscriptBlockState(block); err != nil {
		return err
	}
	return validateTranscriptBlockBranch(block)
}

func validateTranscriptBlockIdentity(block TranscriptBlock) error {
	if block.ID == "" {
		return fmt.Errorf("transcript block id is required")
	}
	if err := validateStorageID("transcript block id", block.ID); err != nil {
		return err
	}
	if block.ConversationID == "" {
		return fmt.Errorf("transcript block %s conversationId is required", block.ID)
	}
	if err := validateConversationID(block.ConversationID); err != nil {
		return fmt.Errorf("transcript block %s %w", block.ID, err)
	}
	if block.RunID == "" {
		return fmt.Errorf("transcript block %s runId is required", block.ID)
	}
	if err := validateRunID(block.RunID); err != nil {
		return fmt.Errorf("transcript block %s %w", block.ID, err)
	}
	return nil
}

func validateTranscriptBlockState(block TranscriptBlock) error {
	if !validValue(block.Kind, transcriptBlockKindValues) {
		return fmt.Errorf("transcript block %s has unsupported kind %s", block.ID, block.Kind)
	}
	if block.Ordinal <= 0 {
		return fmt.Errorf("transcript block %s ordinal must be positive", block.ID)
	}
	if block.RunAnchorOrdinal <= 0 {
		return fmt.Errorf("transcript block %s runAnchorOrdinal must be positive", block.ID)
	}
	if !validValue(block.Status, transcriptBlockStatusValues) {
		return fmt.Errorf("transcript block %s has unsupported status %s", block.ID, block.Status)
	}
	if err := validateTimestamp(block.CreatedAt, "transcript block "+block.ID+" createdAt"); err != nil {
		return err
	}
	return validateTimestamp(block.UpdatedAt, "transcript block "+block.ID+" updatedAt")
}

// validateTranscriptBlockBranch enforces that exactly one branch payload is
// populated and that it matches the authoritative Kind.
func validateTranscriptBlockBranch(block TranscriptBlock) error {
	populated := transcriptBlockPopulatedKinds(block)
	if len(populated) != 1 {
		return fmt.Errorf("transcript block %s must populate exactly one branch payload, found %d", block.ID, len(populated))
	}
	if populated[0] != block.Kind {
		return fmt.Errorf("transcript block %s kind %s does not match populated %s branch", block.ID, block.Kind, populated[0])
	}
	switch block.Kind {
	case TranscriptBlockKindUserMessage:
		return validateTranscriptMessageProjection(block.ID, *block.UserMessage)
	case TranscriptBlockKindAssistantText:
		return validateAssistantTextBlockProjection(block.ID, *block.AssistantText)
	case TranscriptBlockKindReasoning:
		return validateReasoningBlockProjection(block.ID, *block.Reasoning)
	case TranscriptBlockKindActivityItem:
		return validateActivityItemBlockProjection(block.ID, *block.Activity)
	case TranscriptBlockKindRunStatus:
		return validateRunStatusBlockProjection(block.ID, *block.RunStatus)
	case TranscriptBlockKindBackgroundTerminal:
		return validateBackgroundTerminalBlockProjection(block.ID, *block.BackgroundTerminal)
	default:
		return fmt.Errorf("transcript block %s has unsupported kind %s", block.ID, block.Kind)
	}
}

func transcriptBlockPopulatedKinds(block TranscriptBlock) []TranscriptBlockKind {
	populated := make([]TranscriptBlockKind, 0, 1)
	if block.UserMessage != nil {
		populated = append(populated, TranscriptBlockKindUserMessage)
	}
	if block.AssistantText != nil {
		populated = append(populated, TranscriptBlockKindAssistantText)
	}
	if block.Reasoning != nil {
		populated = append(populated, TranscriptBlockKindReasoning)
	}
	if block.Activity != nil {
		populated = append(populated, TranscriptBlockKindActivityItem)
	}
	if block.RunStatus != nil {
		populated = append(populated, TranscriptBlockKindRunStatus)
	}
	if block.BackgroundTerminal != nil {
		populated = append(populated, TranscriptBlockKindBackgroundTerminal)
	}
	return populated
}

func validateTranscriptMessageProjection(blockID string, message TranscriptMessageProjection) error {
	if message.MessageID == "" {
		return fmt.Errorf("transcript block %s userMessage messageId is required", blockID)
	}
	if err := validateMessageID(message.MessageID); err != nil {
		return fmt.Errorf("transcript block %s userMessage %w", blockID, err)
	}
	if !validValue(message.Role, messageRoleValues) {
		return fmt.Errorf("transcript block %s userMessage has unsupported role %s", blockID, message.Role)
	}
	if !validValue(message.Delivery, messageDeliveryValues) {
		return fmt.Errorf("transcript block %s userMessage has unsupported delivery %s", blockID, message.Delivery)
	}
	if !validValue(message.Status, messageStatusValues) {
		return fmt.Errorf("transcript block %s userMessage has unsupported status %s", blockID, message.Status)
	}
	if len(message.Parts) == 0 {
		return fmt.Errorf("transcript block %s userMessage must contain at least one part", blockID)
	}
	for _, part := range message.Parts {
		if err := validateMessagePart(message.MessageID, part); err != nil {
			return fmt.Errorf("transcript block %s %w", blockID, err)
		}
	}
	return nil
}

func validateAssistantTextBlockProjection(blockID string, text AssistantTextBlockProjection) error {
	if !validValue(text.Format, textFormatValues) {
		return fmt.Errorf("transcript block %s assistantText has unsupported format %s", blockID, text.Format)
	}
	return nil
}

func validateReasoningBlockProjection(blockID string, reasoning ReasoningBlockProjection) error {
	if reasoning.SourceRunItemID == "" {
		return fmt.Errorf("transcript block %s reasoning sourceRunItemId is required", blockID)
	}
	if err := validateRunItemID(reasoning.SourceRunItemID); err != nil {
		return fmt.Errorf("transcript block %s reasoning %w", blockID, err)
	}
	if !validValue(reasoning.Mode, reasoningBlockModeValues) {
		return fmt.Errorf("transcript block %s reasoning has unsupported mode %s", blockID, reasoning.Mode)
	}
	if reasoning.Headline == "" {
		return fmt.Errorf("transcript block %s reasoning headline is required", blockID)
	}
	if reasoning.Mode == ReasoningBlockModeSummary && reasoning.Summary == "" {
		return fmt.Errorf("transcript block %s reasoning summary is required in summary mode", blockID)
	}
	return nil
}

func validateActivityItemBlockProjection(blockID string, activity ActivityItemBlockProjection) error {
	if activity.SourceRunItemID == "" {
		return fmt.Errorf("transcript block %s activity sourceRunItemId is required", blockID)
	}
	if err := validateRunItemID(activity.SourceRunItemID); err != nil {
		return fmt.Errorf("transcript block %s activity %w", blockID, err)
	}
	if !validValue(activity.Type, runItemTypeValues) {
		return fmt.Errorf("transcript block %s activity has unsupported type %s", blockID, activity.Type)
	}
	if !validValue(activity.Status, runItemStatusValues) {
		return fmt.Errorf("transcript block %s activity has unsupported status %s", blockID, activity.Status)
	}
	return nil
}

func validateRunStatusBlockProjection(blockID string, status RunStatusBlockProjection) error {
	if !validValue(status.Mode, runStatusBlockModeValues) {
		return fmt.Errorf("transcript block %s runStatus has unsupported mode %s", blockID, status.Mode)
	}
	return nil
}

func validateBackgroundTerminalBlockProjection(blockID string, terminal BackgroundTerminalBlockProjection) error {
	if terminal.ProcessID == "" {
		return fmt.Errorf("transcript block %s backgroundTerminal processId is required", blockID)
	}
	if err := validateStorageID("background terminal block processId", terminal.ProcessID); err != nil {
		return fmt.Errorf("transcript block %s backgroundTerminal %w", blockID, err)
	}
	if terminal.Label == "" {
		return fmt.Errorf("transcript block %s backgroundTerminal label is required", blockID)
	}
	return nil
}
