package mcpx

import (
	"context"
	"strings"

	"setta/internal/tools"
)

type verificationStatus string

const (
	verificationStatusPassed  verificationStatus = "passed"
	verificationStatusFailed  verificationStatus = "failed"
	verificationStatusMissing verificationStatus = "missing"
)

type checkStatus string

const (
	checkStatusPassed checkStatus = "passed"
	checkStatusFailed checkStatus = "failed"
	checkStatusNotRun checkStatus = "not_run"
)

type completionCheckResult struct {
	CheckName string      `json:"checkName"`
	Required  bool        `json:"required"`
	Status    checkStatus `json:"status"`
	Details   *string     `json:"details"`
	Source    *string     `json:"source"`
}

type completionStatusReport struct {
	TaskID               *string                 `json:"taskId"`
	CompletionIntent     bool                    `json:"completionIntent"`
	RequiresVerification bool                    `json:"requiresVerification"`
	CheckResults         []completionCheckResult `json:"checkResults"`
	VerificationStatus   verificationStatus      `json:"verificationStatus"`
}

func newReportCompletionStatusHandler() tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		return buildCompletionStatusReport(arguments)
	}
}

func buildCompletionStatusReport(arguments map[string]any) (completionStatusReport, error) {
	completionIntent, err := readRequiredBoolArgument(arguments, "completionIntent")
	if err != nil {
		return completionStatusReport{}, err
	}
	requiresVerification, err := readRequiredBoolArgument(arguments, "requiresVerification")
	if err != nil {
		return completionStatusReport{}, err
	}
	taskID, err := readNormalizedOptionalStringArgument(arguments, "taskId")
	if err != nil {
		return completionStatusReport{}, err
	}
	checkResults, err := readCompletionCheckResults(arguments, "checkResults")
	if err != nil {
		return completionStatusReport{}, err
	}

	return completionStatusReport{
		TaskID:               taskID,
		CompletionIntent:     completionIntent,
		RequiresVerification: requiresVerification,
		CheckResults:         checkResults,
		VerificationStatus: resolveCompletionVerificationStatus(
			requiresVerification,
			checkResults,
		),
	}, nil
}

func resolveCompletionVerificationStatus(requiresVerification bool, checkResults []completionCheckResult) verificationStatus {
	if !requiresVerification {
		return verificationStatusPassed
	}

	requiredChecks := make([]completionCheckResult, 0, len(checkResults))
	for _, check := range checkResults {
		if check.Required {
			requiredChecks = append(requiredChecks, check)
		}
	}
	if len(requiredChecks) == 0 {
		return verificationStatusMissing
	}
	for _, check := range requiredChecks {
		if check.Status == checkStatusFailed {
			return verificationStatusFailed
		}
	}
	for _, check := range requiredChecks {
		if check.Status != checkStatusPassed {
			return verificationStatusMissing
		}
	}
	return verificationStatusPassed
}

func readCompletionCheckResults(arguments map[string]any, key string) ([]completionCheckResult, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return []completionCheckResult{}, nil
	}

	switch typed := rawValue.(type) {
	case []completionCheckResult:
		output := make([]completionCheckResult, len(typed))
		copy(output, typed)
		return output, nil
	case []any:
		output := make([]completionCheckResult, 0, len(typed))
		for index, rawEntry := range typed {
			entry, err := readCompletionCheckResultValue(rawEntry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, entry)
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of objects", key)
	}
}

func readCompletionCheckResultValue(rawValue any, key string, index int) (completionCheckResult, error) {
	if typed, ok := rawValue.(completionCheckResult); ok {
		return typed, nil
	}

	object, ok := rawValue.(map[string]any)
	if !ok {
		return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}

	checkNameValue, ok := object["checkName"]
	if !ok || checkNameValue == nil {
		return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d].checkName is required", key, index)
	}
	checkName, ok := checkNameValue.(string)
	if !ok {
		return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d].checkName must be a string", key, index)
	}
	checkName = strings.TrimSpace(checkName)
	if checkName == "" {
		return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d].checkName must be non-empty", key, index)
	}

	required := true
	if rawRequired, ok := object["required"]; ok && rawRequired != nil {
		typedRequired, ok := rawRequired.(bool)
		if !ok {
			return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d].required must be a boolean", key, index)
		}
		required = typedRequired
	}

	statusValue, ok := object["status"]
	if !ok || statusValue == nil {
		return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d].status is required", key, index)
	}
	statusString, ok := statusValue.(string)
	if !ok {
		return completionCheckResult{}, newToolError("invalid_arguments", "%s[%d].status must be a string", key, index)
	}

	status, err := parseCompletionCheckStatus(statusString, key, index)
	if err != nil {
		return completionCheckResult{}, err
	}
	details, err := readNormalizedOptionalStringField(object, "details", key, index)
	if err != nil {
		return completionCheckResult{}, err
	}
	source, err := readNormalizedOptionalStringField(object, "source", key, index)
	if err != nil {
		return completionCheckResult{}, err
	}

	return completionCheckResult{
		CheckName: checkName,
		Required:  required,
		Status:    status,
		Details:   details,
		Source:    source,
	}, nil
}

func parseCompletionCheckStatus(value string, key string, index int) (checkStatus, error) {
	switch checkStatus(value) {
	case checkStatusPassed, checkStatusFailed, checkStatusNotRun:
		return checkStatus(value), nil
	default:
		return "", newToolError(
			"invalid_arguments",
			"%s[%d].status must be one of %q, %q, or %q",
			key,
			index,
			checkStatusPassed,
			checkStatusFailed,
			checkStatusNotRun,
		)
	}
}

func readNormalizedOptionalStringArgument(arguments map[string]any, key string) (*string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	stringValue, ok := rawValue.(string)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be a string or null", key)
	}
	trimmed := strings.TrimSpace(stringValue)
	if trimmed == "" {
		return nil, nil
	}
	return &trimmed, nil
}

func readNormalizedOptionalStringField(object map[string]any, field string, key string, index int) (*string, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return nil, nil
	}
	stringValue, ok := rawValue.(string)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s[%d].%s must be a string or null", key, index, field)
	}
	trimmed := strings.TrimSpace(stringValue)
	if trimmed == "" {
		return nil, nil
	}
	return &trimmed, nil
}
