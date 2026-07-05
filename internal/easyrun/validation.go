package easyrun

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

func validateWorkspaceID(workspaceID string) error {
	return validateStorageID("workspace id", workspaceID)
}

func validateEasyRunID(easyRunID string) error {
	return validateStorageID("easy run id", easyRunID)
}

func validateStorageID(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if value != strings.TrimSpace(value) {
		return fmt.Errorf("%s must not contain leading or trailing whitespace", label)
	}
	if strings.ContainsAny(value, `/\`) {
		return fmt.Errorf("%s must not contain path separators", label)
	}
	return nil
}

func validateEventCursor(cursor EasyRunEventCursor) error {
	if cursor.Sequence < 0 {
		return fmt.Errorf("easy-run event sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("easy-run event stream id is required for non-zero sequence")
	}
	return nil
}

func validateStoredRunRecord(record storedRunRecord) error {
	if record.SchemaVersion != SchemaVersion {
		return fmt.Errorf("easy-run record schemaVersion = %d, want %d", record.SchemaVersion, SchemaVersion)
	}
	if err := validateEasyRun(record.Run); err != nil {
		return err
	}
	if record.BackingRunID != "" {
		if err := validateStorageID("backing run id", record.BackingRunID); err != nil {
			return err
		}
	}
	return nil
}

func validateEasyRun(run EasyRun) error {
	validators := []func(EasyRun) error{
		validateEasyRunIdentity,
		validateEasyRunRequestText,
		validateEasyRunCounts,
		validateEasyRunTerminalFields,
	}
	for _, validate := range validators {
		if err := validate(run); err != nil {
			return err
		}
	}
	return nil
}

func validateEasyRunIdentity(run EasyRun) error {
	if err := validateEasyRunID(run.ID); err != nil {
		return err
	}
	if err := validateWorkspaceID(run.WorkspaceID); err != nil {
		return err
	}
	if !validValue(run.Status, easyRunStatusValues) {
		return fmt.Errorf("unsupported easy-run status %s", run.Status)
	}
	if err := validateStorageID("conversation id", run.ConversationID); err != nil {
		return err
	}
	if err := validateTimestamp("easy-run startedAt", run.StartedAt); err != nil {
		return err
	}
	if !validValue(run.NarratorStatus, easyRunNarratorStatusValues) {
		return fmt.Errorf("unsupported easy-run narrator status %s", run.NarratorStatus)
	}
	return nil
}

func validateEasyRunRequestText(run EasyRun) error {
	if strings.TrimSpace(run.RequestText) == "" {
		return errors.New("easy-run request text is required")
	}
	if run.RequestText != strings.TrimSpace(run.RequestText) {
		return errors.New("easy-run request text must not contain leading or trailing whitespace")
	}
	return nil
}

func validateEasyRunCounts(run EasyRun) error {
	if err := validateNonNegativeEasyRunCount("activeAgentCount", run.ActiveAgentCount); err != nil {
		return err
	}
	if err := validateNonNegativeEasyRunCount("artifactCount", run.ArtifactCount); err != nil {
		return err
	}
	return validateNonNegativeEasyRunCount("highlightCount", run.HighlightCount)
}

func validateNonNegativeEasyRunCount(label string, count int) error {
	if count < 0 {
		return fmt.Errorf("easy-run %s must be non-negative: %d", label, count)
	}
	return nil
}

func validateEasyRunTerminalFields(run EasyRun) error {
	if run.Status == EasyRunStatusWorking {
		return validateWorkingEasyRunFields(run)
	}
	return validateFinishedEasyRunFields(run)
}

func validateWorkingEasyRunFields(run EasyRun) error {
	if run.EndedAt != nil {
		return errors.New("working easy-run must not have endedAt")
	}
	if run.ActiveAgentCount == 0 {
		return errors.New("working easy-run must have at least one active agent")
	}
	return nil
}

func validateFinishedEasyRunFields(run EasyRun) error {
	if run.EndedAt == nil {
		return fmt.Errorf("terminal easy-run %s must have endedAt", run.ID)
	}
	if err := validateTimestamp("easy-run endedAt", *run.EndedAt); err != nil {
		return err
	}
	if run.ActiveAgentCount != 0 {
		return fmt.Errorf("terminal easy-run activeAgentCount = %d, want 0", run.ActiveAgentCount)
	}
	if run.Summary == nil || strings.TrimSpace(*run.Summary) == "" {
		return fmt.Errorf("terminal easy-run %s summary is required", run.ID)
	}
	return validateFinishedEasyRunErrorField(run)
}

func validateFinishedEasyRunErrorField(run EasyRun) error {
	if run.Status == EasyRunStatusFailed {
		return validateFailedEasyRunErrorField(run)
	}
	if run.Error != nil && strings.TrimSpace(*run.Error) != "" {
		return fmt.Errorf("%s easy-run %s must not have an error", run.Status, run.ID)
	}
	return nil
}

func validateFailedEasyRunErrorField(run EasyRun) error {
	if run.Error == nil || strings.TrimSpace(*run.Error) == "" {
		return fmt.Errorf("failed easy-run %s error is required", run.ID)
	}
	return nil
}

func validateTimestamp(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if value != strings.TrimSpace(value) {
		return fmt.Errorf("%s must not contain leading or trailing whitespace", label)
	}
	if _, err := time.Parse(time.RFC3339Nano, value); err != nil {
		return fmt.Errorf("%s must be RFC3339Nano: %w", label, err)
	}
	return nil
}

func validValue[T comparable](candidate T, values []T) bool {
	for _, value := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
