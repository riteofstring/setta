package chat

import (
	"bytes"
)

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
func activityItemBlockProjection(item RunItem, runStatus RunStatus, hasOutput bool, requireDisplayable bool) (ActivityItemBlockProjection, bool) {
	details := runActivityDetailsProjection(item)
	projection := ActivityItemBlockProjection{
		SourceRunItemID: item.ID,
		Type:            item.Type,
		Title:           runActivityProjectionTitle(item),
		Status:          effectiveRunActivityRowStatus(runStatus, item.Status),
		Details:         details,
		HasDetails:      runActivityDetailsInspectable(details),
		HasOutput:       hasOutput,
	}
	if requireDisplayable && !runItemDisplayable(item, projection.Status, projection.HasDetails, hasOutput) {
		return ActivityItemBlockProjection{}, false
	}
	return projection, true
}

func runActivityProjectionTitle(item RunItem) string {
	if item.Title != "" {
		return item.Title
	}
	if title, ok := runActivityTypedTitle(item); ok {
		return title
	}
	if defaultTitle, ok := runActivityDefaultTitles[item.Type]; ok {
		return defaultTitle
	}
	return string(item.Type)
}

func runActivityTypedTitle(item RunItem) (string, bool) {
	switch item.Type {
	case RunItemTypeCommandExecution, RunItemTypeTerminalInteraction:
		return runActivityCommandTitle(item), true
	case RunItemTypeMCPToolCall:
		return runActivityMCPTitle(item), true
	case RunItemTypeDynamicToolCall, RunItemTypeCollabAgentToolCall:
		return runActivityToolTitle(item), true
	case RunItemTypeNotice:
		return runActivityNoticeTitle(item), true
	default:
		return "", false
	}
}

func runActivityCommandTitle(item RunItem) string {
	command := ""
	if commandDetails, ok := item.CommandExecutionDetails(); ok {
		command = commandDetails.Command
	} else if item.Type != RunItemTypeCommandExecution {
		command = item.Command
	}
	if command != "" {
		return summarizeCommandLabel(command)
	}
	if defaultTitle, ok := runActivityDefaultTitles[item.Type]; ok {
		return defaultTitle
	}
	return string(item.Type)
}

func runActivityMCPTitle(item RunItem) string {
	if mcpDetails, ok := item.MCPToolCallDetails(); ok {
		if mcpDetails.DisplayTitle != "" {
			return mcpDetails.DisplayTitle
		}
		if mcpDetails.ServerName != "" {
			return "MCP: " + mcpDetails.ServerName
		}
	}
	return "MCP tool call"
}

func runActivityToolTitle(item RunItem) string {
	if item.ToolName != "" && item.ServerName != "" {
		return item.ServerName + "." + item.ToolName
	}
	if item.ToolName != "" {
		return item.ToolName
	}
	return "tool call"
}

func runActivityNoticeTitle(item RunItem) string {
	if item.NoticeKind != "" {
		return item.NoticeKind
	}
	return "notice"
}

func runActivityDetailsProjection(item RunItem) RunActivityDetailsProjection {
	commandExecution := runItemCommandExecutionDetailsProjection(item)
	return RunActivityDetailsProjection{
		Summary:          publicRunActivitySummary(item),
		Command:          runActivityCommand(item, commandExecution),
		Cwd:              runActivityCwd(item, commandExecution),
		ExitCode:         runActivityExitCode(item, commandExecution),
		DurationMs:       runActivityDurationMs(item, commandExecution),
		FilePaths:        append([]string{}, item.FilePaths...),
		PatchStatus:      item.PatchStatus,
		ServerName:       item.ServerName,
		ToolName:         item.ToolName,
		Progress:         item.Progress,
		Result:           runActivityResult(item, commandExecution),
		Error:            runActivityError(item, commandExecution),
		NoticeKind:       item.NoticeKind,
		NoticeMessage:    item.NoticeMessage,
		DiffSummary:      item.DiffSummary,
		Namespace:        item.Namespace,
		ProcessID:        runActivityProcessID(item, commandExecution),
		RequestID:        item.RequestID,
		ReviewID:         item.ReviewID,
		Details:          cloneRawMessage(item.RawDetails),
		CommandExecution: commandExecution,
		MCPToolCall:      runItemMCPToolCallDetailsProjection(item),
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

func cloneMCPToolCallDetails(details RunItemMCPToolCallDetails) RunItemMCPToolCallDetails {
	details.Arguments = cloneRawMessage(details.Arguments)
	details.AppContext = cloneRawMessage(details.AppContext)
	if details.Result != nil {
		result := *details.Result
		result.Content = cloneRawMessages(result.Content)
		result.StructuredContent = cloneRawMessage(result.StructuredContent)
		result.Meta = cloneRawMessage(result.Meta)
		details.Result = &result
	}
	return details
}

func cloneCommandExecutionDetails(details RunItemCommandExecutionDetails) RunItemCommandExecutionDetails {
	if details.Source != nil {
		source := *details.Source
		details.Source = &source
	}
	return details
}

func runActivityDetailsInspectable(details RunActivityDetailsProjection) bool {
	return runActivityStringDetailsInspectable(details) ||
		details.ExitCode != 0 ||
		details.DurationMs != 0 ||
		len(details.FilePaths) > 0 ||
		rawDetailsInspectable(details.Details) ||
		details.CommandExecution != nil ||
		details.MCPToolCall != nil
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

func runItemMCPToolCallDetailsProjection(item RunItem) *RunItemMCPToolCallDetails {
	details, ok := item.MCPToolCallDetails()
	if !ok {
		return nil
	}
	cloned := cloneMCPToolCallDetails(*details)
	return &cloned
}

func runItemCommandExecutionDetailsProjection(item RunItem) *RunItemCommandExecutionDetails {
	details, ok := item.CommandExecutionDetails()
	if !ok {
		return nil
	}
	cloned := cloneCommandExecutionDetails(*details)
	return &cloned
}

func runActivityCommand(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Command
	}
	if item.Type == RunItemTypeCommandExecution {
		return ""
	}
	return item.Command
}

func runActivityCwd(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Cwd
	}
	if item.Type == RunItemTypeCommandExecution {
		return ""
	}
	return item.Cwd
}

func runActivityExitCode(item RunItem, commandExecution *RunItemCommandExecutionDetails) int {
	if commandExecution != nil {
		return commandExecution.ExitCode
	}
	if item.Type == RunItemTypeCommandExecution {
		return 0
	}
	return item.ExitCode
}

func runActivityDurationMs(item RunItem, commandExecution *RunItemCommandExecutionDetails) int {
	if commandExecution != nil {
		return commandExecution.DurationMs
	}
	if item.Type == RunItemTypeCommandExecution {
		return 0
	}
	return item.DurationMs
}

func runActivityProcessID(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.ProcessID
	}
	if item.Type == RunItemTypeCommandExecution {
		return ""
	}
	return item.ProcessID
}

func runActivityResult(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Result
	}
	if item.Type == RunItemTypeCommandExecution {
		return ""
	}
	return item.Result
}

func runActivityError(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Error
	}
	if item.Type == RunItemTypeCommandExecution {
		return ""
	}
	return item.Error
}
