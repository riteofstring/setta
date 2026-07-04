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
	return validateRunItemMCPToolCallDetails(item, *item.Details.MCPToolCall)
}
