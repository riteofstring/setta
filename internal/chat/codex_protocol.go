package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func threadIDFromResponse(raw json.RawMessage) (string, error) {
	response, err := objectValue(raw, "codex thread response")
	if err != nil {
		return "", err
	}
	thread, err := requireObject(response, "thread", "codex thread response")
	if err != nil {
		return "", err
	}
	threadID, err := requireString(thread, "id", "codex thread response thread")
	if err != nil {
		return "", err
	}
	return threadID, nil
}

func turnIDFromResponse(raw json.RawMessage) (string, error) {
	response, err := objectValue(raw, "codex turn response")
	if err != nil {
		return "", err
	}
	turn, err := requireObject(response, "turn", "codex turn response")
	if err != nil {
		return "", err
	}
	turnID, err := requireString(turn, "id", "codex turn response turn")
	if err != nil {
		return "", err
	}
	return turnID, nil
}

func objectValue(raw json.RawMessage, label string) (map[string]any, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("%s must be an object: %w", label, err)
	}
	if value == nil {
		return nil, fmt.Errorf("%s must be an object", label)
	}
	return value, nil
}

func requireObject(value map[string]any, name string, label string) (map[string]any, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%s.%s is required", label, name)
	}
	object, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an object", label, name)
	}
	return object, nil
}

func requireString(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	if text == "" {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	return text, nil
}

func requireBool(value map[string]any, name string, label string) (bool, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return false, fmt.Errorf("%s.%s is required", label, name)
	}
	flag, ok := raw.(bool)
	if !ok {
		return false, fmt.Errorf("%s.%s must be a boolean", label, name)
	}
	return flag, nil
}

func optionalString(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", nil
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	return text, nil
}

func optionalBool(value map[string]any, name string, label string) (bool, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return false, nil
	}
	flag, ok := raw.(bool)
	if !ok {
		return false, fmt.Errorf("%s.%s must be a boolean", label, name)
	}
	return flag, nil
}

func optionalInt(value map[string]any, name string, label string) (int, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return 0, nil
	}
	number, ok := raw.(float64)
	if !ok {
		return 0, fmt.Errorf("%s.%s must be a number", label, name)
	}
	if number != float64(int(number)) {
		return 0, fmt.Errorf("%s.%s must be an integer", label, name)
	}
	return int(number), nil
}

func optionalStringArray(value map[string]any, name string, label string) ([]string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return []string{}, nil
	}
	values, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an array", label, name)
	}
	result := make([]string, 0, len(values))
	for index, rawValue := range values {
		text, ok := rawValue.(string)
		if !ok {
			return nil, fmt.Errorf("%s.%s[%d] must be a string", label, name, index)
		}
		if text != "" {
			result = append(result, text)
		}
	}
	return result, nil
}

type codexRunItemBase struct {
	providerItemID string
	status         RunItemStatus
	itemType       RunItemType
}

type codexRunItemTextFields struct {
	title   string
	summary string
}

type codexRunItemExecutionFields struct {
	command    string
	cwd        string
	durationMs int
	exitCode   int
}

type codexRunItemFileToolFields struct {
	filePaths   []string
	patchStatus string
	progress    string
	serverName  string
	toolName    string
}

type codexRunItemResultFields struct {
	errorMessage string
	result       string
}

func runItemFromCodexItem(item map[string]any, status RunItemStatus) (RunItem, error) {
	base, err := codexRunItemBaseFromItem(item, status)
	if err != nil {
		return RunItem{}, err
	}
	textFields, err := codexRunItemTextFieldsFromItem(item)
	if err != nil {
		return RunItem{}, err
	}
	executionFields, err := codexRunItemExecutionFieldsFromItem(item)
	if err != nil {
		return RunItem{}, err
	}
	fileToolFields, err := codexRunItemFileToolFieldsFromItem(item)
	if err != nil {
		return RunItem{}, err
	}
	resultFields, err := codexRunItemResultFieldsFromItem(item)
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: base.providerItemID,
		Type:           base.itemType,
		Status:         base.status,
		Title:          textFields.title,
		Summary:        textFields.summary,
		Command:        executionFields.command,
		Cwd:            executionFields.cwd,
		ExitCode:       executionFields.exitCode,
		DurationMs:     executionFields.durationMs,
		FilePaths:      fileToolFields.filePaths,
		PatchStatus:    fileToolFields.patchStatus,
		ServerName:     fileToolFields.serverName,
		ToolName:       fileToolFields.toolName,
		Progress:       fileToolFields.progress,
		Result:         resultFields.result,
		Error:          resultFields.errorMessage,
	}, nil
}

func codexRunItemBaseFromItem(item map[string]any, status RunItemStatus) (codexRunItemBase, error) {
	providerItemID, err := requireString(item, "id", "codex item")
	if err != nil {
		return codexRunItemBase{}, err
	}
	codexType, err := requireString(item, "type", "codex item")
	if err != nil {
		return codexRunItemBase{}, err
	}
	itemType, err := mapCodexItemType(codexType)
	if err != nil {
		return codexRunItemBase{}, err
	}
	itemStatus, err := optionalString(item, "status", "codex item")
	if err != nil {
		return codexRunItemBase{}, err
	}
	if itemStatus != "" {
		status, err = mapCodexItemStatus(itemStatus)
		if err != nil {
			return codexRunItemBase{}, err
		}
	}
	return codexRunItemBase{providerItemID: providerItemID, itemType: itemType, status: status}, nil
}

func codexRunItemTextFieldsFromItem(item map[string]any) (codexRunItemTextFields, error) {
	codexType, err := requireString(item, "type", "codex item")
	if err != nil {
		return codexRunItemTextFields{}, err
	}
	switch codexType {
	case "agentMessage":
		text, err := requireStringAllowEmpty(item, "text", "codex item")
		if err != nil {
			return codexRunItemTextFields{}, err
		}
		return codexRunItemTextFields{title: "Assistant message", summary: text}, nil
	case "plan":
		text, err := requireStringAllowEmpty(item, "text", "codex item")
		if err != nil {
			return codexRunItemTextFields{}, err
		}
		return codexRunItemTextFields{title: "Plan update", summary: text}, nil
	case "reasoning":
		summary, err := requireJoinedStringArray(item, "summary", "codex item")
		if err != nil {
			return codexRunItemTextFields{}, err
		}
		return codexRunItemTextFields{title: "Reasoning summary", summary: summary}, nil
	case "contextCompaction":
		return codexRunItemTextFields{title: "Context compaction"}, nil
	default:
		return codexRunItemTextFields{}, nil
	}
}

func codexRunItemExecutionFieldsFromItem(item map[string]any) (codexRunItemExecutionFields, error) {
	command, err := optionalString(item, "command", "codex item")
	if err != nil {
		return codexRunItemExecutionFields{}, err
	}
	cwd, err := optionalString(item, "cwd", "codex item")
	if err != nil {
		return codexRunItemExecutionFields{}, err
	}
	exitCode, err := optionalInt(item, "exitCode", "codex item")
	if err != nil {
		return codexRunItemExecutionFields{}, err
	}
	durationMs, err := optionalInt(item, "durationMs", "codex item")
	if err != nil {
		return codexRunItemExecutionFields{}, err
	}
	return codexRunItemExecutionFields{command: command, cwd: cwd, exitCode: exitCode, durationMs: durationMs}, nil
}

func codexRunItemFileToolFieldsFromItem(item map[string]any) (codexRunItemFileToolFields, error) {
	filePaths, err := optionalStringArray(item, "changedPaths", "codex item")
	if err != nil {
		return codexRunItemFileToolFields{}, err
	}
	patchStatus, err := optionalString(item, "patchStatus", "codex item")
	if err != nil {
		return codexRunItemFileToolFields{}, err
	}
	serverName, err := optionalString(item, "serverName", "codex item")
	if err != nil {
		return codexRunItemFileToolFields{}, err
	}
	toolName, err := optionalString(item, "toolName", "codex item")
	if err != nil {
		return codexRunItemFileToolFields{}, err
	}
	progress, err := optionalString(item, "progress", "codex item")
	if err != nil {
		return codexRunItemFileToolFields{}, err
	}
	return codexRunItemFileToolFields{
		filePaths:   filePaths,
		patchStatus: patchStatus,
		progress:    progress,
		serverName:  serverName,
		toolName:    toolName,
	}, nil
}

func codexRunItemResultFieldsFromItem(item map[string]any) (codexRunItemResultFields, error) {
	result, err := optionalString(item, "result", "codex item")
	if err != nil {
		return codexRunItemResultFields{}, err
	}
	errorMessage, err := optionalString(item, "error", "codex item")
	if err != nil {
		return codexRunItemResultFields{}, err
	}
	return codexRunItemResultFields{result: result, errorMessage: errorMessage}, nil
}

var codexRunItemTypeByCodexType = map[string]RunItemType{
	"agentMessage":        RunItemTypeAgentMessage,
	"collabAgentToolCall": RunItemTypeCollabAgentToolCall,
	"commandExecution":    RunItemTypeCommandExecution,
	"diff":                RunItemTypeDiff,
	"dynamicToolCall":     RunItemTypeDynamicToolCall,
	"fileChange":          RunItemTypeFileChange,
	"imageGeneration":     RunItemTypeImageGeneration,
	"imageView":           RunItemTypeImageView,
	"mcpToolCall":         RunItemTypeMCPToolCall,
	"plan":                RunItemTypePlan,
	"contextCompaction":   RunItemTypeContextCompaction,
	"reasoning":           RunItemTypeReasoning,
	"terminalInteraction": RunItemTypeTerminalInteraction,
	"webSearch":           RunItemTypeWebSearch,
}

func mapCodexItemType(codexType string) (RunItemType, error) {
	itemType, ok := codexRunItemTypeByCodexType[codexType]
	if !ok {
		return "", fmt.Errorf("unsupported codex item type: %s", codexType)
	}
	return itemType, nil
}

// Codex app-server 0.135.0 item status values observed from the app-server
// protocol source and exercised by the local protocol fixtures.
var codexRunItemStatusByCodexStatus = map[string]RunItemStatus{
	"completed":   RunItemStatusCompleted,
	"declined":    RunItemStatusCancelled,
	"failed":      RunItemStatusFailed,
	"inProgress":  RunItemStatusRunning,
	"interrupted": RunItemStatusCancelled,
	"succeeded":   RunItemStatusCompleted,
}

func requireJoinedStringArray(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	values, ok := raw.([]any)
	if !ok {
		return "", fmt.Errorf("%s.%s must be an array", label, name)
	}
	parts := make([]string, 0, len(values))
	for index, rawValue := range values {
		part, ok := rawValue.(string)
		if !ok {
			return "", fmt.Errorf("%s.%s[%d] must be a string", label, name, index)
		}
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, "\n"), nil
}

func requireStringAllowEmpty(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	return text, nil
}

func mapCodexItemStatus(status string) (RunItemStatus, error) {
	itemStatus, ok := codexRunItemStatusByCodexStatus[status]
	if !ok {
		return "", fmt.Errorf("unsupported codex item status: %s", status)
	}
	return itemStatus, nil
}

func jsonSummary(value map[string]any) (string, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", fmt.Errorf("summarize codex JSON object: %w", err)
	}
	return string(data), nil
}

func jsonSummaryAny(value any) (string, error) {
	if value == nil {
		return "", nil
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", fmt.Errorf("summarize codex JSON value: %w", err)
	}
	return string(data), nil
}

func questionOptions(question map[string]any, label string) ([]string, error) {
	raw, ok := question["options"]
	if !ok || raw == nil {
		return []string{}, nil
	}
	rawOptions, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.options must be an array", label)
	}
	options := make([]string, 0, len(rawOptions))
	for index, rawOption := range rawOptions {
		option, ok := rawOption.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s.options[%d] must be an object", label, index)
		}
		optionLabel, err := requireString(option, "label", fmt.Sprintf("%s.options[%d]", label, index))
		if err != nil {
			return nil, err
		}
		options = append(options, optionLabel)
	}
	return options, nil
}

func userInputQuestions(params map[string]any) ([]ApprovalQuestion, string, string, []string, error) {
	rawQuestions, err := requireQuestionArray(params)
	if err != nil {
		return nil, "", "", nil, err
	}
	questions := make([]ApprovalQuestion, 0, len(rawQuestions))
	for index, raw := range rawQuestions {
		question, err := approvalQuestionFromCodex(raw, index)
		if err != nil {
			return nil, "", "", nil, err
		}
		questions = append(questions, question)
	}
	title, body, options := userInputSummary(questions)
	return questions, title, body, options, nil
}

func requireQuestionArray(params map[string]any) ([]any, error) {
	raw, ok := params["questions"]
	if !ok || raw == nil {
		return nil, errors.New("codex user input approval.questions is required")
	}
	rawQuestions, ok := raw.([]any)
	if !ok {
		return nil, errors.New("codex user input approval.questions must be an array")
	}
	if len(rawQuestions) == 0 {
		return nil, errors.New("codex user input approval.questions must not be empty")
	}
	return rawQuestions, nil
}

func approvalQuestionFromCodex(raw any, index int) (ApprovalQuestion, error) {
	question, ok := raw.(map[string]any)
	if !ok {
		return ApprovalQuestion{}, fmt.Errorf("codex user input approval.questions[%d] must be an object", index)
	}
	label := fmt.Sprintf("codex user input approval.questions[%d]", index)
	id, err := requireString(question, "id", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	text, err := requireString(question, "question", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	header, err := optionalString(question, "header", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	options, err := questionOptions(question, label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	isOther, err := optionalBool(question, "isOther", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	isSecret, err := optionalBool(question, "isSecret", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	return ApprovalQuestion{
		ID:       id,
		Header:   header,
		Question: text,
		Options:  options,
		IsOther:  isOther,
		IsSecret: isSecret,
	}, nil
}

func userInputSummary(questions []ApprovalQuestion) (string, string, []string) {
	first := questions[0]
	title := "User input requested"
	if first.Header != "" {
		title = first.Header
	}
	return title, first.Question, first.Options
}

func turnErrorMessage(turn map[string]any) (string, error) {
	rawError, err := requireObject(turn, "error", "codex failed turn")
	if err != nil {
		return "", err
	}
	return requireString(rawError, "message", "codex failed turn error")
}

func requestIDString(id any) (string, error) {
	switch value := id.(type) {
	case string:
		if value == "" {
			return "", errors.New("codex request id is required")
		}
		return value, nil
	case float64:
		if value != float64(int(value)) {
			return "", fmt.Errorf("codex request id must be an integer: %v", value)
		}
		return strconv.Itoa(int(value)), nil
	default:
		return "", fmt.Errorf("codex request id must be a string or integer: %T", id)
	}
}
