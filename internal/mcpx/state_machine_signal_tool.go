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

type reportStateMachineSignalRequest struct {
	signalName   string
	payload      map[string]any
	machineRunID string
	sectionID    string
}

type reportStateMachineSignalInvocation struct {
	projectConfigID  string
	childRunID       string
	contextSectionID string
	shareSessionID   string
}

func newReportStateMachineSignalHandler(runtime stateMachineRunProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		request, err := parseReportStateMachineSignalRequest(arguments)
		if err != nil {
			return nil, err
		}
		invocation, err := requireStateMachineSignalInvocation(ctx)
		if err != nil {
			return nil, err
		}
		if runtime == nil || runtime.Disabled() {
			return nil, newToolError("internal_error", "State machine runtime is unavailable.")
		}
		if strings.TrimSpace(invocation.childRunID) == "" {
			return nil, newToolError("invalid_arguments", "report_state_machine_signal requires an active child run.")
		}
		report, err := runtime.ReportSignal(
			invocation.projectConfigID,
			optionalStringPointer(invocation.childRunID),
			optionalStringPointer(request.machineRunID),
			firstNonEmptyOptionalString(request.sectionID, invocation.contextSectionID),
			request.signalName,
			request.payload,
			optionalStringPointer(invocation.shareSessionID),
		)
		if err != nil {
			return nil, stateMachineSignalToolError(err)
		}
		return report, nil
	}
}

func parseReportStateMachineSignalRequest(arguments map[string]any) (reportStateMachineSignalRequest, error) {
	signalName, err := readRequiredStringArgument(arguments, "signalName")
	if err != nil {
		return reportStateMachineSignalRequest{}, err
	}
	payloadArgument, err := readOptionalObjectPointerArgument(arguments, "payload")
	if err != nil {
		return reportStateMachineSignalRequest{}, err
	}
	machineRunID, err := readOptionalStringArgument(arguments, "machineRunId")
	if err != nil {
		return reportStateMachineSignalRequest{}, err
	}
	sectionID, err := readOptionalStringArgument(arguments, "sectionId")
	if err != nil {
		return reportStateMachineSignalRequest{}, err
	}
	request := reportStateMachineSignalRequest{
		signalName:   signalName,
		machineRunID: machineRunID,
		sectionID:    sectionID,
	}
	if payloadArgument != nil {
		request.payload = *payloadArgument
	}
	return request, nil
}

func requireStateMachineSignalInvocation(ctx context.Context) (reportStateMachineSignalInvocation, error) {
	invocation, ok := ToolInvocationFromContext(ctx)
	if !ok || invocation.AgenticContext == nil {
		return reportStateMachineSignalInvocation{}, newToolError("internal_error", "Scoped workflow signal invocation context is unavailable.")
	}
	return reportStateMachineSignalInvocation{
		projectConfigID:  invocation.AgenticContext.ProjectConfigID,
		childRunID:       invocation.AgenticContext.RunID,
		contextSectionID: invocation.AgenticContext.SectionID,
		shareSessionID:   invocation.AgenticContext.ShareSessionID,
	}, nil
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
