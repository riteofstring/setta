package mcpx

import (
	"context"
	"errors"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/tools"
)

func newReportStateMachineSignalHandler(runtime stateMachineRunProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		signalName, err := readRequiredStringArgument(arguments, "signalName")
		if err != nil {
			return nil, err
		}
		payloadArgument, err := readOptionalObjectPointerArgument(arguments, "payload")
		if err != nil {
			return nil, err
		}
		machineRunID, err := readOptionalStringArgument(arguments, "machineRunId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readOptionalStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil {
			return nil, newToolError("internal_error", "Scoped workflow signal invocation context is unavailable.")
		}
		if runtime == nil || runtime.Disabled() {
			return nil, newToolError("internal_error", "State machine runtime is unavailable.")
		}

		projectConfigID := invocation.AgenticContext.ProjectConfigID
		childRunID := invocation.AgenticContext.RunID
		if strings.TrimSpace(childRunID) == "" {
			return nil, newToolError("invalid_arguments", "report_state_machine_signal requires an active child run.")
		}
		contextSectionID := invocation.AgenticContext.SectionID
		var payload map[string]any
		if payloadArgument != nil {
			payload = *payloadArgument
		}
		report, err := runtime.ReportSignal(
			projectConfigID,
			optionalStringPointer(childRunID),
			optionalStringPointer(machineRunID),
			firstNonEmptyOptionalString(sectionID, contextSectionID),
			signalName,
			payload,
			optionalStringPointer(invocation.AgenticContext.ShareSessionID),
		)
		if err != nil {
			return nil, stateMachineSignalToolError(err)
		}
		return report, nil
	}
}

func stateMachineSignalToolError(err error) error {
	switch {
	case errors.Is(err, agentruns.ErrRunNotFound):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, agentruns.ErrEngineConfigNotFound):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrSectionNotFound):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, prompttemplates.ErrTemplateNotFound):
		return newToolError("invalid_arguments", "%s", err.Error())
	default:
		return newToolError("invalid_arguments", "%s", err.Error())
	}
}

func optionalStringPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func firstNonEmptyOptionalString(primary string, fallback string) *string {
	if primary != "" {
		return &primary
	}
	if fallback != "" {
		return &fallback
	}
	return nil
}
