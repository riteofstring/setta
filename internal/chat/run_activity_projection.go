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

func buildRunActivityProjection(run Run, items []RunItem, outputs []RunItemOutput) *RunActivityGroupProjection {
	hasOutputByRunItemID := runItemOutputPresence(outputs)
	rows := make([]RunActivityRowProjection, 0, len(items))
	statusTitle := ""
	for _, item := range items {
		hasOutput := hasOutputByRunItemID[item.ID]
		row, ok := runActivityRowProjection(run, item, hasOutput)
		if ok {
			rows = append(rows, row)
			continue
		}
		if title := runActivityStatusTitle(run, item, hasOutput); title != "" {
			statusTitle = title
		}
	}
	if len(rows) == 0 && statusTitle == "" {
		return nil
	}
	status := runActivityGroupStatus(rows)
	if statusTitle != "" && status != RunStatusFailed && status != RunStatusCancelled {
		status = RunStatusRunning
	}
	return &RunActivityGroupProjection{
		RunID:       run.ID,
		Status:      status,
		StatusTitle: statusTitle,
		Rows:        rows,
	}
}

func runActivityRowProjection(run Run, item RunItem, hasOutput bool) (RunActivityRowProjection, bool) {
	status := effectiveRunActivityRowStatus(run.Status, item.Status)
	details := runActivityDetailsProjection(item)
	hasDetails := runActivityDetailsInspectable(details)
	if !runItemDisplayable(item, status, hasDetails, hasOutput) {
		return RunActivityRowProjection{}, false
	}
	return RunActivityRowProjection{
		ID:              "activity_" + item.ID,
		SourceRunItemID: item.ID,
		Type:            item.Type,
		Title:           runActivityTitle(item),
		Status:          status,
		Details:         details,
		HasDetails:      hasDetails,
		HasOutput:       hasOutput,
	}, true
}

func runItemOutputPresence(outputs []RunItemOutput) map[string]bool {
	presence := map[string]bool{}
	for _, output := range outputs {
		if output.RunItemID != "" {
			presence[output.RunItemID] = true
		}
	}
	return presence
}

func runActivityStatusTitle(run Run, item RunItem, hasOutput bool) string {
	status := effectiveRunActivityRowStatus(run.Status, item.Status)
	if item.Type != RunItemTypeReasoning || hasOutput {
		return ""
	}
	if status != RunItemStatusPending && status != RunItemStatusRunning {
		return ""
	}
	details := runActivityDetailsProjection(item)
	if runActivityDetailsInspectable(details) {
		return ""
	}
	return runActivityTitle(item)
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
	case RunItemTypePlan, RunItemTypeNotice:
		return item.Title != "" || item.NoticeKind != "" || item.NoticeMessage != ""
	case RunItemTypeReasoning:
		return false
	default:
		return false
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

func runActivityGroupStatus(rows []RunActivityRowProjection) RunStatus {
	status := RunStatusCompleted
	for _, row := range rows {
		switch row.Status {
		case RunItemStatusFailed:
			return RunStatusFailed
		case RunItemStatusCancelled:
			status = RunStatusCancelled
		case RunItemStatusPending, RunItemStatusRunning:
			if status != RunStatusCancelled {
				status = RunStatusRunning
			}
		}
	}
	return status
}
