package easyrun

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	maxEasyArtifactsPerRun       = 20
	maxEasyHighlightsPerRun      = 12
	maxEasyMarkdownArtifactBytes = 16 * 1024
	maxEasyTableArtifactColumns  = 12
	maxEasyTableArtifactRows     = 100
	maxEasyBarChartArtifactItems = 24
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

func validateStoredArtifactCollection(easyRunID string, collection storedArtifactCollection) error {
	if err := validateEasyRunID(easyRunID); err != nil {
		return err
	}
	if collection.SchemaVersion != SchemaVersion {
		return fmt.Errorf("easy-run artifact collection schemaVersion = %d, want %d", collection.SchemaVersion, SchemaVersion)
	}
	if len(collection.Artifacts) > maxEasyArtifactsPerRun {
		return fmt.Errorf("easy-run artifact count %d exceeds cap %d", len(collection.Artifacts), maxEasyArtifactsPerRun)
	}
	ids := map[string]struct{}{}
	ordinals := map[int]struct{}{}
	for index, artifact := range collection.Artifacts {
		if err := validateEasyArtifact(artifact); err != nil {
			return fmt.Errorf("artifact[%d]: %w", index, err)
		}
		if artifact.EasyRunID != easyRunID {
			return fmt.Errorf("artifact[%d] belongs to easy-run %s, not %s", index, artifact.EasyRunID, easyRunID)
		}
		if _, exists := ids[artifact.ID]; exists {
			return fmt.Errorf("duplicate easy-run artifact id %s", artifact.ID)
		}
		if _, exists := ordinals[artifact.Ordinal]; exists {
			return fmt.Errorf("duplicate easy-run artifact ordinal %d", artifact.Ordinal)
		}
		ids[artifact.ID] = struct{}{}
		ordinals[artifact.Ordinal] = struct{}{}
	}
	return nil
}

func validateStoredHighlightCollection(easyRunID string, collection storedHighlightCollection) error {
	if err := validateEasyRunID(easyRunID); err != nil {
		return err
	}
	if collection.SchemaVersion != SchemaVersion {
		return fmt.Errorf("easy-run highlight collection schemaVersion = %d, want %d", collection.SchemaVersion, SchemaVersion)
	}
	if len(collection.Highlights) > maxEasyHighlightsPerRun {
		return fmt.Errorf("easy-run highlight count %d exceeds cap %d", len(collection.Highlights), maxEasyHighlightsPerRun)
	}
	ids := map[string]struct{}{}
	ordinals := map[int]struct{}{}
	for index, highlight := range collection.Highlights {
		if err := validateEasyHighlight(highlight); err != nil {
			return fmt.Errorf("highlight[%d]: %w", index, err)
		}
		if highlight.EasyRunID != easyRunID {
			return fmt.Errorf("highlight[%d] belongs to easy-run %s, not %s", index, highlight.EasyRunID, easyRunID)
		}
		if _, exists := ids[highlight.ID]; exists {
			return fmt.Errorf("duplicate easy-run highlight id %s", highlight.ID)
		}
		if _, exists := ordinals[highlight.Ordinal]; exists {
			return fmt.Errorf("duplicate easy-run highlight ordinal %d", highlight.Ordinal)
		}
		ids[highlight.ID] = struct{}{}
		ordinals[highlight.Ordinal] = struct{}{}
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

func validateEasyArtifact(artifact EasyArtifact) error {
	if err := validateStorageID("artifact id", artifact.ID); err != nil {
		return err
	}
	if err := validateEasyRunID(artifact.EasyRunID); err != nil {
		return err
	}
	if artifact.Ordinal <= 0 {
		return fmt.Errorf("artifact ordinal must be positive: %d", artifact.Ordinal)
	}
	if !validValue(artifact.Kind, easyArtifactKindValues) {
		return fmt.Errorf("unsupported easy artifact kind %s", artifact.Kind)
	}
	if err := validateRequiredTrimmedText("artifact title", artifact.Title); err != nil {
		return err
	}
	if err := validateOptionalTrimmedText("artifact kicker", artifact.Kicker); err != nil {
		return err
	}
	if err := validateTimestamp("artifact createdAt", artifact.CreatedAt); err != nil {
		return err
	}
	if err := validateArtifactBranchCount(artifact); err != nil {
		return err
	}
	return validateArtifactPayload(artifact)
}

func validateEasyHighlight(highlight EasyHighlight) error {
	if err := validateStorageID("highlight id", highlight.ID); err != nil {
		return err
	}
	if err := validateEasyRunID(highlight.EasyRunID); err != nil {
		return err
	}
	if highlight.Ordinal <= 0 {
		return fmt.Errorf("highlight ordinal must be positive: %d", highlight.Ordinal)
	}
	if err := validateRequiredTrimmedText("highlight text", highlight.Text); err != nil {
		return err
	}
	return validateTimestamp("highlight at", highlight.At)
}

func validateArtifactBranchCount(artifact EasyArtifact) error {
	populated := 0
	if artifact.Markdown != nil {
		populated++
	}
	if artifact.Table != nil {
		populated++
	}
	if artifact.BarChart != nil {
		populated++
	}
	if artifact.File != nil {
		populated++
	}
	if populated != 1 {
		return fmt.Errorf("artifact %s must populate exactly one payload branch, found %d", artifact.ID, populated)
	}
	return nil
}

func validateArtifactPayload(artifact EasyArtifact) error {
	switch artifact.Kind {
	case EasyArtifactKindMarkdown:
		if artifact.Markdown == nil {
			return errors.New("markdown artifact payload is required")
		}
		return validateMarkdownArtifactPayload(*artifact.Markdown)
	case EasyArtifactKindTable:
		if artifact.Table == nil {
			return errors.New("table artifact payload is required")
		}
		return validateTableArtifactPayload(*artifact.Table)
	case EasyArtifactKindBarChart:
		if artifact.BarChart == nil {
			return errors.New("bar chart artifact payload is required")
		}
		return validateBarChartArtifactPayload(*artifact.BarChart)
	case EasyArtifactKindFile:
		if artifact.File == nil {
			return errors.New("file artifact payload is required")
		}
		return validateFileArtifactPayload(*artifact.File)
	default:
		return fmt.Errorf("unsupported easy artifact kind %s", artifact.Kind)
	}
}

func validateMarkdownArtifactPayload(payload EasyMarkdownArtifactPayload) error {
	if err := validateRequiredTrimmedText("markdown artifact markdown", payload.Markdown); err != nil {
		return err
	}
	if len([]byte(payload.Markdown)) > maxEasyMarkdownArtifactBytes {
		return fmt.Errorf("markdown artifact exceeds %d bytes", maxEasyMarkdownArtifactBytes)
	}
	return nil
}

func validateTableArtifactPayload(payload EasyTableArtifactPayload) error {
	if len(payload.Columns) == 0 {
		return errors.New("table artifact requires at least one column")
	}
	if len(payload.Columns) > maxEasyTableArtifactColumns {
		return fmt.Errorf("table artifact has %d columns, cap is %d", len(payload.Columns), maxEasyTableArtifactColumns)
	}
	if len(payload.Rows) > maxEasyTableArtifactRows {
		return fmt.Errorf("table artifact has %d rows, cap is %d", len(payload.Rows), maxEasyTableArtifactRows)
	}
	keys := map[string]struct{}{}
	for index, column := range payload.Columns {
		if err := validateRequiredTrimmedText(fmt.Sprintf("table artifact column[%d].key", index), column.Key); err != nil {
			return err
		}
		if err := validateRequiredTrimmedText(fmt.Sprintf("table artifact column[%d].label", index), column.Label); err != nil {
			return err
		}
		if _, exists := keys[column.Key]; exists {
			return fmt.Errorf("table artifact duplicate column key %s", column.Key)
		}
		keys[column.Key] = struct{}{}
	}
	for index, row := range payload.Rows {
		if len(row) != len(payload.Columns) {
			return fmt.Errorf("table artifact row[%d] has %d cells, want %d", index, len(row), len(payload.Columns))
		}
	}
	return nil
}

func validateBarChartArtifactPayload(payload EasyBarChartArtifactPayload) error {
	if len(payload.Items) == 0 {
		return errors.New("bar chart artifact requires at least one item")
	}
	if len(payload.Items) > maxEasyBarChartArtifactItems {
		return fmt.Errorf("bar chart artifact has %d items, cap is %d", len(payload.Items), maxEasyBarChartArtifactItems)
	}
	for index, item := range payload.Items {
		if err := validateRequiredTrimmedText(fmt.Sprintf("bar chart artifact item[%d].label", index), item.Label); err != nil {
			return err
		}
		if item.Value < 0 {
			return fmt.Errorf("bar chart artifact item[%d].value must be non-negative", index)
		}
		if err := validateOptionalTrimmedText(fmt.Sprintf("bar chart artifact item[%d].unit", index), item.Unit); err != nil {
			return err
		}
	}
	return nil
}

func validateFileArtifactPayload(payload EasyFileArtifactPayload) error {
	if err := validateRequiredTrimmedText("file artifact path", payload.Path); err != nil {
		return err
	}
	return validateOptionalTrimmedText("file artifact description", payload.Description)
}

func validateRequiredTrimmedText(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if value != strings.TrimSpace(value) {
		return fmt.Errorf("%s must not contain leading or trailing whitespace", label)
	}
	return nil
}

func validateOptionalTrimmedText(label string, value *string) error {
	if value == nil {
		return nil
	}
	if strings.TrimSpace(*value) == "" {
		return fmt.Errorf("%s must not be empty", label)
	}
	if *value != strings.TrimSpace(*value) {
		return fmt.Errorf("%s must not contain leading or trailing whitespace", label)
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
