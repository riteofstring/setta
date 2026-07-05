package chat

import (
	"bytes"
)

var runActivityDefaultTitles = map[RunItemType]string{
	RunItemTypeCommandExecution:        "command execution",
	RunItemTypeCommandStartFailure:     "Shell command failed to start",
	RunItemTypeWebSearch:               "web search",
	RunItemTypeImageView:               "image view",
	RunItemTypeImageGeneration:         "image generation",
	RunItemTypeFileChange:              "file change",
	RunItemTypeTerminalInteraction:     "terminal interaction",
	RunItemTypeDiff:                    "Diff updated",
	RunItemTypeProviderStreamLifecycle: "Codex stream event",
	RunItemTypeContextCompaction:       "context compaction",
	RunItemTypePlan:                    "Plan update",
	RunItemTypeReasoning:               "Reasoning summary",
	RunItemTypeApprovalRequest:         "approval request",
	RunItemTypeApprovalReview:          "approval review",
	RunItemTypeHook:                    "hook",
	RunItemTypeStructuredInput:         "structured input",
	RunItemTypeAgentMessage:            "Assistant message",
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
		RunItemTypeCommandStartFailure,
		RunItemTypeFileChange,
		RunItemTypeMCPToolCall,
		RunItemTypeCollabAgentToolCall,
		RunItemTypeWebSearch,
		RunItemTypeImageView,
		RunItemTypeImageGeneration,
		RunItemTypeTerminalInteraction,
		RunItemTypeDiff,
		RunItemTypeProviderStreamLifecycle,
		RunItemTypeContextCompaction,
		RunItemTypeApprovalRequest,
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
		Status:          runActivityProjectionStatus(item, runStatus),
		Details:         details,
		HasDetails:      runActivityDetailsInspectable(details),
		HasOutput:       hasOutput,
	}
	if requireDisplayable && !runItemDisplayable(item, projection.Status, projection.HasDetails, hasOutput) {
		return ActivityItemBlockProjection{}, false
	}
	return projection, true
}

func runActivityProjectionStatus(item RunItem, runStatus RunStatus) RunItemStatus {
	if details, ok := item.ProviderStreamLifecycleDetails(); ok && !details.WillRetry {
		// The run stays active/lost so liveness controls remain available, but the
		// diagnostic row itself should read as a failed stream event.
		return RunItemStatusFailed
	}
	return effectiveRunActivityRowStatus(runStatus, item.Status)
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
	case RunItemTypeCommandStartFailure:
		return runActivityCommandStartFailureTitle(item), true
	case RunItemTypeMCPToolCall:
		return runActivityMCPTitle(item), true
	case RunItemTypeFileChange:
		return runActivityFileChangeTitle(item), true
	case RunItemTypeDiff:
		return runActivityDiffTitle(item), true
	case RunItemTypeCollabAgentToolCall:
		return runActivityToolTitle(item), true
	case RunItemTypeApprovalRequest, RunItemTypeApprovalReview:
		return runActivityApprovalTitle(item), true
	case RunItemTypeProviderStreamLifecycle:
		return runActivityProviderStreamLifecycleTitle(item), true
	case RunItemTypeNotice:
		return runActivityNoticeTitle(item), true
	default:
		return "", false
	}
}

func runActivityCommandStartFailureTitle(item RunItem) string {
	if _, ok := item.CommandStartFailureDetails(); ok {
		return "Shell command failed to start"
	}
	return "Shell command failed to start"
}

func runActivityFileChangeTitle(item RunItem) string {
	if details, ok := item.FileChangeDetails(); ok {
		return runItemFileChangeTitle(details)
	}
	return "file change"
}

func runActivityDiffTitle(item RunItem) string {
	if details, ok := item.DiffDetails(); ok {
		return runItemDiffTitle(details)
	}
	return "Diff updated"
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

func runActivityApprovalTitle(item RunItem) string {
	details, ok := item.ApprovalDetails()
	if !ok {
		if item.Type == RunItemTypeApprovalReview {
			return "approval review"
		}
		return "approval request"
	}
	if details.Title != "" {
		return details.Title
	}
	if details.ReviewID != "" {
		return "Auto-approval review"
	}
	if details.ApprovalKind != nil {
		switch *details.ApprovalKind {
		case ApprovalKindCommand:
			return "Command approval"
		case ApprovalKindFileChange:
			return "File change approval"
		case ApprovalKindPermission:
			return "Permission approval"
		case ApprovalKindStructured:
			return "MCP input requested"
		case ApprovalKindUserInput:
			return "User input approval"
		}
	}
	return "approval request"
}

func runActivityNoticeTitle(item RunItem) string {
	if item.NoticeKind != "" {
		return item.NoticeKind
	}
	return "notice"
}

func runActivityProviderStreamLifecycleTitle(item RunItem) string {
	details, ok := item.ProviderStreamLifecycleDetails()
	if !ok {
		return "Codex stream event"
	}
	if details.WillRetry {
		return "Codex connection retrying"
	}
	return "Codex stream failed"
}

func runActivityDetailsProjection(item RunItem) RunActivityDetailsProjection {
	plan := runItemPlanDetailsProjection(item)
	commandExecution := runItemCommandExecutionDetailsProjection(item)
	commandStartFailure := runItemCommandStartFailureDetailsProjection(item)
	fileChange := runItemFileChangeDetailsProjection(item)
	diff := runItemDiffDetailsProjection(item)
	approval := runItemApprovalDetailsProjection(item)
	providerStreamLifecycle := runItemProviderStreamLifecycleDetailsProjection(item)
	return RunActivityDetailsProjection{
		Summary:                 publicRunActivitySummary(item),
		Plan:                    plan,
		Command:                 runActivityCommand(item, commandExecution),
		Cwd:                     runActivityCwd(item, commandExecution),
		ExitCode:                runActivityExitCode(item, commandExecution),
		DurationMs:              runActivityDurationMs(item, commandExecution),
		FilePaths:               runActivityFilePaths(item, fileChange, diff),
		PatchStatus:             runActivityPatchStatus(item, fileChange),
		ServerName:              item.ServerName,
		ToolName:                item.ToolName,
		Progress:                item.Progress,
		Result:                  runActivityResult(item, commandExecution),
		Error:                   runActivityError(item, commandExecution),
		NoticeKind:              item.NoticeKind,
		NoticeMessage:           item.NoticeMessage,
		Namespace:               item.Namespace,
		ProcessID:               runActivityProcessID(item, commandExecution),
		RequestID:               runActivityRequestID(item),
		ReviewID:                runActivityReviewID(item),
		Details:                 cloneRawMessage(item.RawDetails),
		CommandExecution:        commandExecution,
		CommandStartFailure:     commandStartFailure,
		MCPToolCall:             runItemMCPToolCallDetailsProjection(item),
		FileChange:              fileChange,
		Diff:                    diff,
		Approval:                approval,
		ProviderStreamLifecycle: providerStreamLifecycle,
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

func clonePlanDetails(details RunItemPlanDetails) RunItemPlanDetails {
	details.Steps = clonePlanSteps(details.Steps)
	return details
}

func clonePlanSteps(steps []RunItemPlanStep) []RunItemPlanStep {
	if steps == nil {
		return nil
	}
	cloned := make([]RunItemPlanStep, len(steps))
	copy(cloned, steps)
	return cloned
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

func cloneCommandStartFailureDetails(details RunItemCommandStartFailureDetails) RunItemCommandStartFailureDetails {
	if details.Source != nil {
		source := *details.Source
		details.Source = &source
	}
	return details
}

func cloneApprovalDetails(details RunItemApprovalDetails) RunItemApprovalDetails {
	if details.ApprovalKind != nil {
		kind := *details.ApprovalKind
		details.ApprovalKind = &kind
	}
	if details.ApprovalStatus != nil {
		status := *details.ApprovalStatus
		details.ApprovalStatus = &status
	}
	details.Options = append([]string{}, details.Options...)
	details.Questions = cloneApprovalQuestions(details.Questions)
	if details.StructuredInput != nil {
		input := *details.StructuredInput
		input.Schema = cloneRawMessage(input.Schema)
		input.Meta = cloneRawMessage(input.Meta)
		details.StructuredInput = &input
	}
	details.Review = cloneRawMessage(details.Review)
	details.Action = cloneRawMessage(details.Action)
	return details
}

func cloneProviderStreamLifecycleDetails(details RunItemProviderStreamLifecycleDetails) RunItemProviderStreamLifecycleDetails {
	details.CodexErrorInfo = cloneRawMessage(details.CodexErrorInfo)
	return details
}

func cloneApprovalQuestions(questions []ApprovalQuestion) []ApprovalQuestion {
	if questions == nil {
		return nil
	}
	cloned := make([]ApprovalQuestion, len(questions))
	for index, question := range questions {
		cloned[index] = question
		cloned[index].Options = append([]string{}, question.Options...)
	}
	return cloned
}

func runActivityDetailsInspectable(details RunActivityDetailsProjection) bool {
	return runActivityStringDetailsInspectable(details) ||
		runActivityScalarDetailsInspectable(details) ||
		runActivityStructuredDetailsInspectable(details)
}

func runActivityScalarDetailsInspectable(details RunActivityDetailsProjection) bool {
	return details.ExitCode != 0 ||
		details.DurationMs != 0 ||
		len(details.FilePaths) > 0
}

func runActivityStructuredDetailsInspectable(details RunActivityDetailsProjection) bool {
	return rawDetailsInspectable(details.Details) ||
		details.Plan != nil ||
		details.CommandExecution != nil ||
		details.CommandStartFailure != nil ||
		details.MCPToolCall != nil ||
		details.FileChange != nil ||
		details.Diff != nil ||
		details.Approval != nil ||
		details.ProviderStreamLifecycle != nil
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

func runItemPlanDetailsProjection(item RunItem) *RunItemPlanDetails {
	details, ok := item.PlanDetails()
	if !ok {
		return nil
	}
	cloned := clonePlanDetails(*details)
	return &cloned
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

func runItemCommandStartFailureDetailsProjection(item RunItem) *RunItemCommandStartFailureDetails {
	details, ok := item.CommandStartFailureDetails()
	if !ok {
		return nil
	}
	cloned := cloneCommandStartFailureDetails(*details)
	return &cloned
}

func runItemFileChangeDetailsProjection(item RunItem) *RunItemFileChangeDetails {
	details, ok := item.FileChangeDetails()
	if !ok {
		return nil
	}
	cloned := cloneRunItemFileChangeDetails(*details)
	return &cloned
}

func runItemDiffDetailsProjection(item RunItem) *RunItemDiffDetails {
	details, ok := item.DiffDetails()
	if !ok {
		return nil
	}
	cloned := cloneRunItemDiffDetails(*details)
	return &cloned
}

func runItemApprovalDetailsProjection(item RunItem) *RunItemApprovalDetails {
	details, ok := item.ApprovalDetails()
	if !ok {
		return nil
	}
	cloned := cloneApprovalDetails(*details)
	return &cloned
}

func runItemProviderStreamLifecycleDetailsProjection(item RunItem) *RunItemProviderStreamLifecycleDetails {
	details, ok := item.ProviderStreamLifecycleDetails()
	if !ok {
		return nil
	}
	cloned := cloneProviderStreamLifecycleDetails(*details)
	return &cloned
}

func runActivityFilePaths(item RunItem, fileChange *RunItemFileChangeDetails, diff *RunItemDiffDetails) []string {
	if fileChange != nil {
		return runItemFileChangePaths(fileChange)
	}
	if diff != nil {
		return runItemDiffPaths(diff)
	}
	if item.Type == RunItemTypeFileChange {
		return []string{}
	}
	if item.Type == RunItemTypeDiff {
		return []string{}
	}
	return append([]string{}, item.FilePaths...)
}

func runActivityPatchStatus(item RunItem, fileChange *RunItemFileChangeDetails) string {
	if fileChange != nil {
		return fileChange.PatchStatus
	}
	if item.Type == RunItemTypeFileChange {
		return ""
	}
	return item.PatchStatus
}

func runActivityCommand(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Command
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return ""
	}
	return item.Command
}

func runActivityCwd(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Cwd
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return ""
	}
	return item.Cwd
}

func runActivityExitCode(item RunItem, commandExecution *RunItemCommandExecutionDetails) int {
	if commandExecution != nil {
		return commandExecution.ExitCode
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return 0
	}
	return item.ExitCode
}

func runActivityDurationMs(item RunItem, commandExecution *RunItemCommandExecutionDetails) int {
	if commandExecution != nil {
		return commandExecution.DurationMs
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return 0
	}
	return item.DurationMs
}

func runActivityProcessID(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.ProcessID
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return ""
	}
	return item.ProcessID
}

func runActivityRequestID(item RunItem) string {
	if item.Type == RunItemTypeApprovalRequest || item.Type == RunItemTypeApprovalReview {
		return ""
	}
	return item.RequestID
}

func runActivityReviewID(item RunItem) string {
	if item.Type == RunItemTypeApprovalRequest || item.Type == RunItemTypeApprovalReview {
		return ""
	}
	return item.ReviewID
}

func runActivityResult(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Result
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return ""
	}
	return item.Result
}

func runActivityError(item RunItem, commandExecution *RunItemCommandExecutionDetails) string {
	if commandExecution != nil {
		return commandExecution.Error
	}
	if runActivitySuppressesFlatCommandFields(item) {
		return ""
	}
	return item.Error
}

func runActivitySuppressesFlatCommandFields(item RunItem) bool {
	return item.Type == RunItemTypeCommandExecution || item.Type == RunItemTypeCommandStartFailure
}
