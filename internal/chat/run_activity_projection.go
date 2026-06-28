package chat

import "bytes"

var runActivityDefaultTitles = map[RunItemType]string{
	RunItemTypeCommandExecution:    "command execution",
	RunItemTypeWebSearch:           "web search",
	RunItemTypeImageView:           "image view",
	RunItemTypeImageGeneration:     "image generation",
	RunItemTypeFileChange:          "file change",
	RunItemTypeTerminalInteraction: "terminal interaction",
	RunItemTypeDiff:                "diff",
	RunItemTypeContextCompaction:   "context compaction",
	RunItemTypePlan:                "Plan update",
	RunItemTypeReasoning:           "Reasoning summary",
	RunItemTypeApprovalReview:      "approval review",
	RunItemTypeHook:                "hook",
	RunItemTypeStructuredInput:     "structured input",
	RunItemTypeAgentMessage:        "Assistant message",
}

func effectiveRunActivityRowStatus(runStatus RunStatus, itemStatus RunItemStatus) RunItemStatus {
	if itemStatus != RunItemStatusPending && itemStatus != RunItemStatusRunning {
		return itemStatus
	}
	switch runStatus {
	case RunStatusCompleted:
		return RunItemStatusCompleted
	case RunStatusCancelled:
		return RunItemStatusCancelled
	case RunStatusFailed:
		return RunItemStatusFailed
	default:
		return itemStatus
	}
}

func runItemDisplayable(item RunItem, status RunItemStatus, hasDetails bool, hasOutput bool) bool {
	if item.Type == RunItemTypeAgentMessage {
		return false
	}
	if hasDetails || hasOutput {
		return true
	}
	if status != RunItemStatusPending && status != RunItemStatusRunning {
		return false
	}
	switch item.Type {
	case RunItemTypeCommandExecution,
		RunItemTypeFileChange,
		RunItemTypeMCPToolCall,
		RunItemTypeDynamicToolCall,
		RunItemTypeCollabAgentToolCall,
		RunItemTypeWebSearch,
		RunItemTypeImageView,
		RunItemTypeImageGeneration,
		RunItemTypeTerminalInteraction,
		RunItemTypeDiff,
		RunItemTypeContextCompaction,
		RunItemTypeApprovalReview,
		RunItemTypeHook,
		RunItemTypeStructuredInput:
		return true
	case RunItemTypePlan, RunItemTypeReasoning, RunItemTypeNotice:
		return item.Title != "" || item.NoticeKind != "" || item.NoticeMessage != ""
	default:
		return false
	}
}

// activityItemBlockProjection projects a run item into its activity_item block
// payload and reports whether the item is displayable as activity. runStatus is
// the owning run's status so a still-pending/running item inherits a terminal
// run's outcome; hasOutput reports whether the item already has output recorded.
// It is the single source the chronological transcript ingestion and the
// run-activity page projection share, so both decide displayability and build
// the row identically.
func activityItemBlockProjection(item RunItem, runStatus RunStatus, hasOutput bool) (ActivityItemBlockProjection, bool) {
	projection := activityItemBlockProjectionFields(item, runStatus, hasOutput)
	if !runItemDisplayable(item, projection.Status, projection.HasDetails, hasOutput) {
		return ActivityItemBlockProjection{}, false
	}
	return projection, true
}

// activityItemBlockProjectionFields builds the activity_item payload without the
// displayability gate. The in-place update path uses it to refresh an existing
// block's fields, where the block has already been deemed displayable and must
// not be dropped if a later status makes a fresh item non-displayable.
func activityItemBlockProjectionFields(item RunItem, runStatus RunStatus, hasOutput bool) ActivityItemBlockProjection {
	details := runActivityDetailsProjection(item)
	return ActivityItemBlockProjection{
		SourceRunItemID: item.ID,
		Type:            item.Type,
		Title:           runActivityTitle(item),
		Status:          effectiveRunActivityRowStatus(runStatus, item.Status),
		Details:         details,
		HasDetails:      runActivityDetailsInspectable(details),
		HasOutput:       hasOutput,
	}
}

func runActivityDetailsProjection(item RunItem) RunActivityDetailsProjection {
	return RunActivityDetailsProjection{
		Summary:       publicRunActivitySummary(item),
		Command:       item.Command,
		Cwd:           item.Cwd,
		ExitCode:      item.ExitCode,
		DurationMs:    item.DurationMs,
		FilePaths:     append([]string{}, item.FilePaths...),
		PatchStatus:   item.PatchStatus,
		ServerName:    item.ServerName,
		ToolName:      item.ToolName,
		Progress:      item.Progress,
		Result:        item.Result,
		Error:         item.Error,
		NoticeKind:    item.NoticeKind,
		NoticeMessage: item.NoticeMessage,
		DiffSummary:   item.DiffSummary,
		Namespace:     item.Namespace,
		ProcessID:     item.ProcessID,
		RequestID:     item.RequestID,
		ReviewID:      item.ReviewID,
		Details:       cloneRawMessage(item.Details),
	}
}

func publicRunActivitySummary(item RunItem) string {
	if item.Type == RunItemTypeAgentMessage {
		return ""
	}
	return item.Summary
}

func cloneRawMessage(raw []byte) []byte {
	if len(raw) == 0 {
		return nil
	}
	return append([]byte{}, raw...)
}

func runActivityDetailsInspectable(details RunActivityDetailsProjection) bool {
	return runActivityStringDetailsInspectable(details) ||
		details.ExitCode != 0 ||
		details.DurationMs != 0 ||
		len(details.FilePaths) > 0 ||
		rawDetailsInspectable(details.Details)
}

func runActivityStringDetailsInspectable(details RunActivityDetailsProjection) bool {
	values := []string{
		details.Summary,
		details.Command,
		details.Cwd,
		details.PatchStatus,
		details.ServerName,
		details.ToolName,
		details.Progress,
		details.Result,
		details.Error,
		details.NoticeKind,
		details.NoticeMessage,
		details.DiffSummary,
		details.Namespace,
		details.ProcessID,
		details.RequestID,
		details.ReviewID,
	}
	for _, value := range values {
		if value != "" {
			return true
		}
	}
	return false
}

func rawDetailsInspectable(raw []byte) bool {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return false
	}
	return !bytes.Equal(trimmed, []byte("null")) &&
		!bytes.Equal(trimmed, []byte("{}")) &&
		!bytes.Equal(trimmed, []byte("[]"))
}

func runActivityTitle(item RunItem) string {
	if item.Title != "" {
		return item.Title
	}
	switch item.Type {
	case RunItemTypeCommandExecution, RunItemTypeTerminalInteraction:
		if item.Command != "" {
			return summarizeCommandLabel(item.Command)
		}
		return runActivityDefaultTitle(item.Type)
	case RunItemTypeMCPToolCall, RunItemTypeDynamicToolCall, RunItemTypeCollabAgentToolCall:
		if item.ToolName != "" {
			return item.ToolName
		}
		return "tool call"
	case RunItemTypeNotice:
		if item.NoticeKind != "" {
			return item.NoticeKind
		}
		return "notice"
	default:
		return runActivityDefaultTitle(item.Type)
	}
}

func runActivityDefaultTitle(itemType RunItemType) string {
	if title, ok := runActivityDefaultTitles[itemType]; ok {
		return title
	}
	return string(itemType)
}
