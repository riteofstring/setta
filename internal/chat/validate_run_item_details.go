package chat

import "fmt"

func validateRunItemCommandExecutionDetails(item RunItem) error {
	if rawDetailsInspectable(item.RawDetails) {
		return fmt.Errorf("run item %s commandExecution rawDetails must be empty after typed details cutover", item.ID)
	}
	if item.Details == nil {
		return fmt.Errorf("run item %s commandExecution details are required", item.ID)
	}
	if item.Details.Kind != RunItemDetailsKindCommandExecution || item.Details.CommandExecution == nil {
		return fmt.Errorf("run item %s commandExecution details must contain the commandExecution branch", item.ID)
	}
	if item.Details.MCPToolCall != nil {
		return fmt.Errorf("run item %s commandExecution details must not contain the mcpToolCall branch", item.ID)
	}
	if item.Details.DynamicToolCall != nil {
		return fmt.Errorf("run item %s commandExecution details must not contain the dynamicToolCall branch", item.ID)
	}
	if item.Details.FileChange != nil {
		return fmt.Errorf("run item %s commandExecution details must not contain the fileChange branch", item.ID)
	}
	if item.Details.Diff != nil {
		return fmt.Errorf("run item %s commandExecution details must not contain the diff branch", item.ID)
	}
	if err := validateRunItemCommandExecutionFlatFieldsEmpty(item); err != nil {
		return err
	}
	return validateRunItemCommandExecutionDetailsPayload(item, *item.Details.CommandExecution)
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

func validateRunItemMCPToolCallDetailsBranch(item RunItem) error {
	if rawDetailsInspectable(item.RawDetails) {
		return fmt.Errorf("run item %s mcpToolCall rawDetails must be empty after typed details cutover", item.ID)
	}
	if item.Details == nil {
		return fmt.Errorf("run item %s mcpToolCall details are required", item.ID)
	}
	if item.Details.Kind != RunItemDetailsKindMCPToolCall || item.Details.MCPToolCall == nil {
		return fmt.Errorf("run item %s mcpToolCall details must contain the mcpToolCall branch", item.ID)
	}
	if item.Details.CommandExecution != nil {
		return fmt.Errorf("run item %s mcpToolCall details must not contain the commandExecution branch", item.ID)
	}
	if item.Details.DynamicToolCall != nil {
		return fmt.Errorf("run item %s mcpToolCall details must not contain the dynamicToolCall branch", item.ID)
	}
	if item.Details.FileChange != nil {
		return fmt.Errorf("run item %s mcpToolCall details must not contain the fileChange branch", item.ID)
	}
	if item.Details.Diff != nil {
		return fmt.Errorf("run item %s mcpToolCall details must not contain the diff branch", item.ID)
	}
	return validateRunItemMCPToolCallDetails(item, *item.Details.MCPToolCall)
}

func validateRunItemDynamicToolCallDetailsBranch(item RunItem) error {
	if rawDetailsInspectable(item.RawDetails) {
		return fmt.Errorf("run item %s dynamicToolCall rawDetails must be empty after typed details cutover", item.ID)
	}
	if item.Details == nil {
		return fmt.Errorf("run item %s dynamicToolCall details are required", item.ID)
	}
	if item.Details.Kind != RunItemDetailsKindDynamicToolCall || item.Details.DynamicToolCall == nil {
		return fmt.Errorf("run item %s dynamicToolCall details must contain the dynamicToolCall branch", item.ID)
	}
	if item.Details.CommandExecution != nil {
		return fmt.Errorf("run item %s dynamicToolCall details must not contain the commandExecution branch", item.ID)
	}
	if item.Details.MCPToolCall != nil {
		return fmt.Errorf("run item %s dynamicToolCall details must not contain the mcpToolCall branch", item.ID)
	}
	if item.Details.FileChange != nil {
		return fmt.Errorf("run item %s dynamicToolCall details must not contain the fileChange branch", item.ID)
	}
	if item.Details.Diff != nil {
		return fmt.Errorf("run item %s dynamicToolCall details must not contain the diff branch", item.ID)
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
	if rawDetailsInspectable(item.RawDetails) {
		return fmt.Errorf("run item %s fileChange rawDetails must be empty after typed details cutover", item.ID)
	}
	if item.Details == nil {
		return fmt.Errorf("run item %s fileChange details are required", item.ID)
	}
	if item.Details.Kind != RunItemDetailsKindFileChange || item.Details.FileChange == nil {
		return fmt.Errorf("run item %s fileChange details must contain the fileChange branch", item.ID)
	}
	if item.Details.CommandExecution != nil {
		return fmt.Errorf("run item %s fileChange details must not contain the commandExecution branch", item.ID)
	}
	if item.Details.MCPToolCall != nil {
		return fmt.Errorf("run item %s fileChange details must not contain the mcpToolCall branch", item.ID)
	}
	if item.Details.DynamicToolCall != nil {
		return fmt.Errorf("run item %s fileChange details must not contain the dynamicToolCall branch", item.ID)
	}
	if item.Details.Diff != nil {
		return fmt.Errorf("run item %s fileChange details must not contain the diff branch", item.ID)
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
	if rawDetailsInspectable(item.RawDetails) {
		return fmt.Errorf("run item %s diff rawDetails must be empty after typed details cutover", item.ID)
	}
	if item.Details == nil {
		return fmt.Errorf("run item %s diff details are required", item.ID)
	}
	if item.Details.Kind != RunItemDetailsKindDiff || item.Details.Diff == nil {
		return fmt.Errorf("run item %s diff details must contain the diff branch", item.ID)
	}
	if item.Details.CommandExecution != nil {
		return fmt.Errorf("run item %s diff details must not contain the commandExecution branch", item.ID)
	}
	if item.Details.MCPToolCall != nil {
		return fmt.Errorf("run item %s diff details must not contain the mcpToolCall branch", item.ID)
	}
	if item.Details.DynamicToolCall != nil {
		return fmt.Errorf("run item %s diff details must not contain the dynamicToolCall branch", item.ID)
	}
	if item.Details.FileChange != nil {
		return fmt.Errorf("run item %s diff details must not contain the fileChange branch", item.ID)
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
