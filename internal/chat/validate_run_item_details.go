package chat

import "fmt"

func validateRunItemCommandExecutionDetails(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindCommandExecution, "commandExecution"); err != nil {
		return err
	}
	if err := validateRunItemCommandExecutionFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemCommandExecutionDetailsPayload(item, *item.Details.CommandExecution)
}

func validateRunItemCommandStartFailureDetails(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindCommandStartFailure, "commandStartFailure"); err != nil {
		return err
	}
	if err := validateRunItemCommandStartFailureFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemCommandStartFailureDetailsPayload(item, *item.Details.CommandStartFailure)
}

func validateRunItemDetailsBranch(item RunItem, kind RunItemDetailsKind, branch string) error {
	if rawDetailsInspectable(item.RawDetails) {
		return fmt.Errorf("run item %s %s rawDetails must be empty after typed details cutover", item.ID, branch)
	}
	if item.Details == nil {
		return fmt.Errorf("run item %s %s details are required", item.ID, branch)
	}
	if item.Details.Kind != kind {
		return fmt.Errorf("run item %s %s details must contain the %s branch", item.ID, branch, branch)
	}
	if !runItemDetailsBranchPresent(item.Details, kind) {
		return fmt.Errorf("run item %s %s details must contain the %s branch", item.ID, branch, branch)
	}
	return validateRunItemDetailsBranchExclusive(item, *item.Details, branch)
}

func runItemDetailsBranchPresent(details *RunItemDetails, kind RunItemDetailsKind) bool {
	switch kind {
	case RunItemDetailsKindCommandExecution:
		return details.CommandExecution != nil
	case RunItemDetailsKindCommandStartFailure:
		return details.CommandStartFailure != nil
	case RunItemDetailsKindMCPToolCall:
		return details.MCPToolCall != nil
	case RunItemDetailsKindDynamicToolCall:
		return details.DynamicToolCall != nil
	case RunItemDetailsKindFileChange:
		return details.FileChange != nil
	case RunItemDetailsKindDiff:
		return details.Diff != nil
	case RunItemDetailsKindApproval:
		return details.Approval != nil
	case RunItemDetailsKindProviderStreamLifecycle:
		return details.ProviderStreamLifecycle != nil
	default:
		return false
	}
}

func validateRunItemDetailsBranchExclusive(item RunItem, details RunItemDetails, branch string) error {
	branches := []struct {
		name string
		set  bool
	}{
		{name: "commandExecution", set: details.CommandExecution != nil},
		{name: "commandStartFailure", set: details.CommandStartFailure != nil},
		{name: "mcpToolCall", set: details.MCPToolCall != nil},
		{name: "dynamicToolCall", set: details.DynamicToolCall != nil},
		{name: "fileChange", set: details.FileChange != nil},
		{name: "diff", set: details.Diff != nil},
		{name: "approval", set: details.Approval != nil},
		{name: "providerStreamLifecycle", set: details.ProviderStreamLifecycle != nil},
	}
	for _, candidate := range branches {
		if candidate.name == branch {
			continue
		}
		if candidate.set {
			return fmt.Errorf("run item %s %s details must not contain the %s branch", item.ID, branch, candidate.name)
		}
	}
	return nil
}

func validateRunItemCommandExecutionFlatFieldsEmpty(item RunItem) error {
	if item.Command != "" {
		return fmt.Errorf("run item %s commandExecution flat command must be empty after typed details cutover", item.ID)
	}
	if item.Cwd != "" {
		return fmt.Errorf("run item %s commandExecution flat cwd must be empty after typed details cutover", item.ID)
	}
	if item.ExitCode != 0 {
		return fmt.Errorf("run item %s commandExecution flat exitCode must be zero after typed details cutover", item.ID)
	}
	if item.DurationMs != 0 {
		return fmt.Errorf("run item %s commandExecution flat durationMs must be zero after typed details cutover", item.ID)
	}
	if item.Result != "" {
		return fmt.Errorf("run item %s commandExecution flat result must be empty after typed details cutover", item.ID)
	}
	if item.Error != "" {
		return fmt.Errorf("run item %s commandExecution flat error must be empty after typed details cutover", item.ID)
	}
	if item.ProcessID != "" {
		return fmt.Errorf("run item %s commandExecution flat processId must be empty after typed details cutover", item.ID)
	}
	if item.Source != nil {
		return fmt.Errorf("run item %s commandExecution flat source must be empty after typed details cutover", item.ID)
	}
	return nil
}

func validateRunItemCommandExecutionDetailsPayload(item RunItem, details RunItemCommandExecutionDetails) error {
	if details.ExitCode < 0 {
		return fmt.Errorf("run item %s commandExecution exitCode must be non-negative", item.ID)
	}
	if details.DurationMs < 0 {
		return fmt.Errorf("run item %s commandExecution durationMs must be non-negative", item.ID)
	}
	if details.Source != nil && !validValue(*details.Source, runItemCommandSourceValues) {
		return fmt.Errorf("run item %s commandExecution has unsupported source %s", item.ID, *details.Source)
	}
	if details.Source != nil && isBackgroundTerminalStartupSource(*details.Source) && details.ProcessID == "" {
		return fmt.Errorf("run item %s commandExecution unified_exec_startup processId is required", item.ID)
	}
	return nil
}

func validateRunItemCommandStartFailureFlatFieldsEmpty(item RunItem) error {
	if item.Command != "" {
		return fmt.Errorf("run item %s commandStartFailure flat command must be empty after typed details cutover", item.ID)
	}
	if item.Cwd != "" {
		return fmt.Errorf("run item %s commandStartFailure flat cwd must be empty after typed details cutover", item.ID)
	}
	if item.ExitCode != 0 {
		return fmt.Errorf("run item %s commandStartFailure flat exitCode must be zero after typed details cutover", item.ID)
	}
	if item.DurationMs != 0 {
		return fmt.Errorf("run item %s commandStartFailure flat durationMs must be zero after typed details cutover", item.ID)
	}
	if item.Result != "" {
		return fmt.Errorf("run item %s commandStartFailure flat result must be empty after typed details cutover", item.ID)
	}
	if item.Error != "" {
		return fmt.Errorf("run item %s commandStartFailure flat error must be empty after typed details cutover", item.ID)
	}
	if item.ProcessID != "" {
		return fmt.Errorf("run item %s commandStartFailure flat processId must be empty after typed details cutover", item.ID)
	}
	if item.Source != nil {
		return fmt.Errorf("run item %s commandStartFailure flat source must be empty after typed details cutover", item.ID)
	}
	return nil
}

func validateRunItemCommandStartFailureDetailsPayload(item RunItem, details RunItemCommandStartFailureDetails) error {
	if details.Command == "" {
		return fmt.Errorf("run item %s commandStartFailure command is required", item.ID)
	}
	if details.Message == "" {
		return fmt.Errorf("run item %s commandStartFailure message is required", item.ID)
	}
	if details.Source != nil && !validValue(*details.Source, runItemCommandSourceValues) {
		return fmt.Errorf("run item %s commandStartFailure has unsupported source %s", item.ID, *details.Source)
	}
	return nil
}

func validateRunItemMCPToolCallDetailsBranch(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindMCPToolCall, "mcpToolCall"); err != nil {
		return err
	}
	if err := validateRunItemMCPToolCallFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemMCPToolCallDetails(item, *item.Details.MCPToolCall)
}

func validateRunItemMCPToolCallFlatFieldsEmpty(item RunItem) error {
	if item.DurationMs != 0 {
		return fmt.Errorf("run item %s mcpToolCall flat durationMs must be zero after typed details cutover", item.ID)
	}
	return validateRunItemFlatStringFieldsEmpty(item, "mcpToolCall", []runItemFlatStringField{
		{name: "serverName", value: item.ServerName},
		{name: "toolName", value: item.ToolName},
		{name: "progress", value: item.Progress},
		{name: "result", value: item.Result},
		{name: "error", value: item.Error},
	})
}

func validateRunItemDynamicToolCallDetailsBranch(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindDynamicToolCall, "dynamicToolCall"); err != nil {
		return err
	}
	if err := validateRunItemDynamicToolCallFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemDynamicToolCallDetails(item, *item.Details.DynamicToolCall)
}

func validateRunItemDynamicToolCallFlatFieldsEmpty(item RunItem) error {
	if item.DurationMs != 0 {
		return fmt.Errorf("run item %s dynamicToolCall flat durationMs must be zero after typed details cutover", item.ID)
	}
	if item.ServerName != "" {
		return fmt.Errorf("run item %s dynamicToolCall flat serverName must be empty after typed details cutover", item.ID)
	}
	if item.ToolName != "" {
		return fmt.Errorf("run item %s dynamicToolCall flat toolName must be empty after typed details cutover", item.ID)
	}
	if item.Result != "" {
		return fmt.Errorf("run item %s dynamicToolCall flat result must be empty after typed details cutover", item.ID)
	}
	if item.Error != "" {
		return fmt.Errorf("run item %s dynamicToolCall flat error must be empty after typed details cutover", item.ID)
	}
	if item.Namespace != "" {
		return fmt.Errorf("run item %s dynamicToolCall flat namespace must be empty after typed details cutover", item.ID)
	}
	return nil
}

func validateRunItemFileChangeDetailsBranch(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindFileChange, "fileChange"); err != nil {
		return err
	}
	if err := validateRunItemFileChangeFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemFileChangeDetails(item, *item.Details.FileChange)
}

func validateRunItemFileChangeFlatFieldsEmpty(item RunItem) error {
	if len(item.FilePaths) != 0 {
		return fmt.Errorf("run item %s fileChange flat filePaths must be empty after typed details cutover", item.ID)
	}
	if item.PatchStatus != "" {
		return fmt.Errorf("run item %s fileChange flat patchStatus must be empty after typed details cutover", item.ID)
	}
	if item.DiffSummary != "" {
		return fmt.Errorf("run item %s fileChange flat diffSummary must be empty after typed details cutover", item.ID)
	}
	return nil
}

func validateRunItemDiffDetailsBranch(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindDiff, "diff"); err != nil {
		return err
	}
	if err := validateRunItemDiffFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemDiffDetails(item, *item.Details.Diff)
}

func validateRunItemDiffFlatFieldsEmpty(item RunItem) error {
	if len(item.FilePaths) != 0 {
		return fmt.Errorf("run item %s diff flat filePaths must be empty after typed details cutover", item.ID)
	}
	if item.DiffSummary != "" {
		return fmt.Errorf("run item %s diff flat diffSummary must be empty after typed details cutover", item.ID)
	}
	return nil
}

func validateRunItemApprovalDetailsBranch(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindApproval, "approval"); err != nil {
		return err
	}
	if err := validateRunItemApprovalFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemApprovalDetails(item, *item.Details.Approval)
}

func validateRunItemProviderStreamLifecycleDetailsBranch(item RunItem) error {
	if err := validateRunItemDetailsBranch(item, RunItemDetailsKindProviderStreamLifecycle, "providerStreamLifecycle"); err != nil {
		return err
	}
	if err := validateRunItemProviderStreamLifecycleFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemProviderStreamLifecycleDetails(item, *item.Details.ProviderStreamLifecycle)
}

func validateRunItemProviderStreamLifecycleFlatFieldsEmpty(item RunItem) error {
	if item.ExitCode != 0 {
		return fmt.Errorf("run item %s providerStreamLifecycle flat exitCode must be zero after typed details cutover", item.ID)
	}
	if item.DurationMs != 0 {
		return fmt.Errorf("run item %s providerStreamLifecycle flat durationMs must be zero after typed details cutover", item.ID)
	}
	if len(item.FilePaths) != 0 {
		return fmt.Errorf("run item %s providerStreamLifecycle flat filePaths must be empty after typed details cutover", item.ID)
	}
	if item.Source != nil {
		return fmt.Errorf("run item %s providerStreamLifecycle flat source must be empty after typed details cutover", item.ID)
	}
	return validateRunItemFlatStringFieldsEmpty(item, "providerStreamLifecycle", []runItemFlatStringField{
		{name: "command", value: item.Command},
		{name: "cwd", value: item.Cwd},
		{name: "patchStatus", value: item.PatchStatus},
		{name: "serverName", value: item.ServerName},
		{name: "toolName", value: item.ToolName},
		{name: "progress", value: item.Progress},
		{name: "result", value: item.Result},
		{name: "error", value: item.Error},
		{name: "noticeKind", value: item.NoticeKind},
		{name: "noticeMessage", value: item.NoticeMessage},
		{name: "diffSummary", value: item.DiffSummary},
		{name: "namespace", value: item.Namespace},
		{name: "processId", value: item.ProcessID},
		{name: "requestId", value: item.RequestID},
		{name: "reviewId", value: item.ReviewID},
	})
}

func validateRunItemApprovalFlatFieldsEmpty(item RunItem) error {
	if err := validateRunItemFlatStringFieldsEmpty(item, "approval", []runItemFlatStringField{
		{name: "command", value: item.Command},
		{name: "cwd", value: item.Cwd},
	}); err != nil {
		return err
	}
	if len(item.FilePaths) != 0 {
		return fmt.Errorf("run item %s approval flat filePaths must be empty after typed details cutover", item.ID)
	}
	if err := validateRunItemFlatStringFieldsEmpty(item, "approval", []runItemFlatStringField{
		{name: "patchStatus", value: item.PatchStatus},
		{name: "serverName", value: item.ServerName},
		{name: "toolName", value: item.ToolName},
		{name: "result", value: item.Result},
		{name: "error", value: item.Error},
		{name: "diffSummary", value: item.DiffSummary},
		{name: "namespace", value: item.Namespace},
		{name: "processId", value: item.ProcessID},
	}); err != nil {
		return err
	}
	if item.Source != nil {
		return fmt.Errorf("run item %s approval flat source must be empty after typed details cutover", item.ID)
	}
	if err := validateRunItemFlatStringFieldsEmpty(item, "approval", []runItemFlatStringField{
		{name: "requestId", value: item.RequestID},
		{name: "reviewId", value: item.ReviewID},
	}); err != nil {
		return err
	}
	return nil
}

type runItemFlatStringField struct {
	name  string
	value string
}

func validateRunItemFlatStringFieldsEmpty(item RunItem, detailsKind string, fields []runItemFlatStringField) error {
	for _, field := range fields {
		if field.value != "" {
			return fmt.Errorf("run item %s %s flat %s must be empty after typed details cutover", item.ID, detailsKind, field.name)
		}
	}
	return nil
}

func validateRunItemApprovalDetails(item RunItem, details RunItemApprovalDetails) error {
	switch item.Type {
	case RunItemTypeApprovalRequest:
		return validateRunItemApprovalRequestDetails(item, details)
	case RunItemTypeApprovalReview:
		return validateRunItemApprovalReviewDetails(item, details)
	default:
		return fmt.Errorf("run item %s type %s does not support approval details", item.ID, item.Type)
	}
}

func validateRunItemApprovalRequestDetails(item RunItem, details RunItemApprovalDetails) error {
	if details.ApprovalKind == nil {
		return fmt.Errorf("run item %s approval approvalKind is required for request items", item.ID)
	}
	if !validValue(*details.ApprovalKind, approvalKindValues) {
		return fmt.Errorf("run item %s approval has unsupported approvalKind %s", item.ID, *details.ApprovalKind)
	}
	if details.ApprovalStatus == nil {
		return fmt.Errorf("run item %s approval approvalStatus is required for request items", item.ID)
	}
	if !validValue(*details.ApprovalStatus, approvalStatusValues) {
		return fmt.Errorf("run item %s approval has unsupported approvalStatus %s", item.ID, *details.ApprovalStatus)
	}
	if details.Title == "" {
		return fmt.Errorf("run item %s approval title is required for request items", item.ID)
	}
	if details.ReviewID != "" || details.ReviewStatus != "" || details.ActionType != "" ||
		rawDetailsInspectable(details.Review) || rawDetailsInspectable(details.Action) {
		return fmt.Errorf("run item %s approval request details must not contain review fields", item.ID)
	}
	return nil
}

func validateRunItemApprovalReviewDetails(item RunItem, details RunItemApprovalDetails) error {
	if details.ReviewID == "" {
		return fmt.Errorf("run item %s approval reviewId is required for review items", item.ID)
	}
	if details.ReviewStatus == "" {
		return fmt.Errorf("run item %s approval reviewStatus is required for review items", item.ID)
	}
	if details.ActionType == "" {
		return fmt.Errorf("run item %s approval actionType is required for review items", item.ID)
	}
	if approvalReviewRequestFieldPresent(details) {
		return approvalReviewRequestFieldsError(item)
	}
	return nil
}

func approvalReviewRequestFieldPresent(details RunItemApprovalDetails) bool {
	for _, present := range []bool{
		details.ApprovalKind != nil,
		details.ApprovalStatus != nil,
		details.StructuredInput != nil,
		len(details.Options) != 0,
		len(details.Questions) != 0,
	} {
		if present {
			return true
		}
	}
	for _, field := range []string{
		details.ApprovalID,
		details.ProviderRequestID,
		details.Command,
		details.Cwd,
		details.FilePath,
		details.Permission,
		details.Question,
	} {
		if field != "" {
			return true
		}
	}
	return false
}

func approvalReviewRequestFieldsError(item RunItem) error {
	return fmt.Errorf("run item %s approval review details must not contain request fields", item.ID)
}

func validateRunItemDynamicToolCallDetails(item RunItem, details RunItemDynamicToolCallDetails) error {
	if details.DurationMs < 0 {
		return fmt.Errorf("run item %s dynamicToolCall durationMs must be non-negative", item.ID)
	}
	if details.Namespace != "" && details.ToolName == "" {
		return fmt.Errorf("run item %s dynamicToolCall toolName is required when namespace is set", item.ID)
	}
	if details.Result != nil {
		for index, content := range details.Result.ContentItems {
			if content.Type == "" {
				return fmt.Errorf("run item %s dynamicToolCall result contentItems[%d].type is required", item.ID, index)
			}
			switch content.Type {
			case "inputText":
				if content.Text == "" {
					return fmt.Errorf("run item %s dynamicToolCall result contentItems[%d].text is required for inputText", item.ID, index)
				}
			case "inputImage":
				if content.ImageURL == "" {
					return fmt.Errorf("run item %s dynamicToolCall result contentItems[%d].imageUrl is required for inputImage", item.ID, index)
				}
			default:
				return fmt.Errorf("run item %s dynamicToolCall result contentItems[%d].type is unsupported: %s", item.ID, index, content.Type)
			}
		}
	}
	return nil
}

func validateRunItemDiffDetails(item RunItem, details RunItemDiffDetails) error {
	if details.Additions < 0 {
		return fmt.Errorf("run item %s diff additions must be non-negative", item.ID)
	}
	if details.Deletions < 0 {
		return fmt.Errorf("run item %s diff deletions must be non-negative", item.ID)
	}
	for index, path := range details.Paths {
		if path.Path == "" {
			return fmt.Errorf("run item %s diff paths[%d].path is required", item.ID, index)
		}
		if path.Operation != nil && !validValue(*path.Operation, runItemFileChangeOperationValues) {
			return fmt.Errorf("run item %s diff paths[%d] has unsupported operation %s", item.ID, index, *path.Operation)
		}
		if path.Additions < 0 {
			return fmt.Errorf("run item %s diff paths[%d].additions must be non-negative", item.ID, index)
		}
		if path.Deletions < 0 {
			return fmt.Errorf("run item %s diff paths[%d].deletions must be non-negative", item.ID, index)
		}
	}
	if details.PatchTruncated && details.Patch == "" {
		return fmt.Errorf("run item %s diff patch is required when patchTruncated is true", item.ID)
	}
	return nil
}

func validateRunItemProviderStreamLifecycleDetails(item RunItem, details RunItemProviderStreamLifecycleDetails) error {
	if details.Message == "" {
		return fmt.Errorf("run item %s providerStreamLifecycle message is required", item.ID)
	}
	if details.CodexErrorKind == "" {
		return fmt.Errorf("run item %s providerStreamLifecycle codexErrorKind is required", item.ID)
	}
	if !details.StreamFailure {
		return fmt.Errorf("run item %s providerStreamLifecycle streamFailure must be true", item.ID)
	}
	if !validValue(details.LivenessStatus, runLivenessStatusValues) {
		return fmt.Errorf("run item %s providerStreamLifecycle has unsupported livenessStatus %s", item.ID, details.LivenessStatus)
	}
	if !validValue(details.LivenessReason, runLivenessReasonValues) {
		return fmt.Errorf("run item %s providerStreamLifecycle has unsupported livenessReason %s", item.ID, details.LivenessReason)
	}
	if err := validateRunItemProviderStreamLifecycleLiveness(item, details); err != nil {
		return err
	}
	if details.ProviderThreadID == "" {
		return fmt.Errorf("run item %s providerStreamLifecycle providerThreadId is required", item.ID)
	}
	if details.ProviderTurnID == "" {
		return fmt.Errorf("run item %s providerStreamLifecycle providerTurnId is required", item.ID)
	}
	return nil
}

func validateRunItemProviderStreamLifecycleLiveness(item RunItem, details RunItemProviderStreamLifecycleDetails) error {
	if details.WillRetry {
		if details.LivenessStatus != RunLivenessReconciling || details.LivenessReason != RunLivenessReasonStreamResync {
			return fmt.Errorf("run item %s providerStreamLifecycle retrying stream errors must use %s/%s liveness", item.ID, RunLivenessReconciling, RunLivenessReasonStreamResync)
		}
	} else if details.LivenessStatus != RunLivenessLost || details.LivenessReason != RunLivenessReasonProviderUnavailable {
		return fmt.Errorf("run item %s providerStreamLifecycle non-retryable stream errors must use %s/%s liveness", item.ID, RunLivenessLost, RunLivenessReasonProviderUnavailable)
	}
	return nil
}
