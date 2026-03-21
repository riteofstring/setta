package mcpx

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/uisettings"
)

type uiSettingToolErrorResult struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type uiSettingResultSummary struct {
	SettingID   string                 `json:"settingId"`
	Title       string                 `json:"title"`
	Description string                 `json:"description"`
	Source      string                 `json:"source"`
	PluginID    *string                `json:"pluginId,omitempty"`
	Mutability  string                 `json:"mutability"`
	Location    uisettings.Location    `json:"location"`
	ValueSchema uisettings.ValueSchema `json:"valueSchema"`
}

type searchUISettingsResult struct {
	Results []uiSettingResultSummary `json:"results"`
}

type getUISettingValueResult struct {
	Setting *uiSettingResultSummary   `json:"setting,omitempty"`
	Value   any                       `json:"value"`
	Error   *uiSettingToolErrorResult `json:"error,omitempty"`
}

type setUISettingValueResult struct {
	Setting         *uiSettingResultSummary   `json:"setting,omitempty"`
	OldValue        any                       `json:"oldValue"`
	NewValue        any                       `json:"newValue"`
	NormalizedValue any                       `json:"normalizedValue"`
	Changed         bool                      `json:"changed"`
	Reveal          *revealUISettingResult    `json:"reveal,omitempty"`
	Error           *uiSettingToolErrorResult `json:"error,omitempty"`
}

type revealUISettingStatusResult struct {
	SettingID string                          `json:"settingId"`
	Status    string                          `json:"status"`
	Target    *realtime.UISettingRevealTarget `json:"target,omitempty"`
	Error     *uiSettingToolErrorResult       `json:"error,omitempty"`
}

type revealUISettingResult struct {
	RequestID          string                        `json:"requestId"`
	ProjectConfigID    string                        `json:"projectConfigId"`
	DurationMS         int                           `json:"durationMs"`
	EmittedRevealCount int                           `json:"emittedRevealCount"`
	Statuses           []revealUISettingStatusResult `json:"statuses"`
}

func newSearchUISettingsHandler(projectState projectStateProvider, pluginMutations pluginMutationProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			projectState,
			pluginMutations,
			workspaceRoot,
			"Scoped UI-setting search",
		)
		if err != nil {
			return nil, err
		}

		rawQuery, err := readRequiredRawStringArgument(arguments, "query")
		if err != nil {
			return nil, err
		}
		query := strings.TrimSpace(rawQuery)
		if query == "" {
			return nil, newToolError("invalid_arguments", "query must not be empty")
		}

		limit := 5
		if resolvedLimit, err := readOptionalIntArgument(arguments, "limit"); err != nil {
			return nil, err
		} else if resolvedLimit != nil && *resolvedLimit > 0 {
			limit = *resolvedLimit
		}

		sourceFilter, err := readUISettingSourceFilterArgument(arguments)
		if err != nil {
			return nil, err
		}

		_ = projectConfigID
		results, err := registry.Search(query, limit, sourceFilter)
		if err != nil {
			return nil, newToolError("invalid_arguments", "%s", err.Error())
		}

		payload := searchUISettingsResult{Results: make([]uiSettingResultSummary, 0, len(results))}
		for _, entry := range results {
			payload.Results = append(payload.Results, buildUISettingResultSummary(entry))
		}
		return payload, nil
	}
}

func newGetUISettingValueHandler(projectState projectStateProvider, pluginMutations pluginMutationProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			projectState,
			pluginMutations,
			workspaceRoot,
			"Scoped UI-setting read",
		)
		if err != nil {
			return nil, err
		}

		settingID, err := readRequiredStringArgument(arguments, "settingId")
		if err != nil {
			return nil, err
		}

		entry, ok, err := registry.Get(settingID)
		if err != nil {
			return nil, newToolError("invalid_arguments", "%s", err.Error())
		}
		if !ok {
			missingErr := registry.MissingSettingError(settingID)
			errorResult := normalizeUISettingRuntimeError(missingErr, settingID, "read")
			return getUISettingValueResult{
				Value: nil,
				Error: errorResult,
			}, nil
		}

		value, err := registry.ReadValue(ctx, projectConfigID, entry.Metadata.SettingID)
		if err != nil {
			return getUISettingValueResult{
				Setting: summaryPointer(buildUISettingResultSummary(entry.Metadata)),
				Value:   nil,
				Error:   normalizeUISettingRuntimeError(err, entry.Metadata.SettingID, "read"),
			}, nil
		}

		return getUISettingValueResult{
			Setting: summaryPointer(buildUISettingResultSummary(entry.Metadata)),
			Value:   value,
		}, nil
	}
}

func newSetUISettingValueHandler(server *Server, projectState projectStateProvider, pluginMutations pluginMutationProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			projectState,
			pluginMutations,
			workspaceRoot,
			"Scoped UI-setting write",
		)
		if err != nil {
			return nil, err
		}

		settingID, err := readRequiredStringArgument(arguments, "settingId")
		if err != nil {
			return nil, err
		}
		value, err := readRequiredPresentArgument(arguments, "value")
		if err != nil {
			return nil, err
		}
		expectedOldValue, hasExpectedOldValue := arguments["expectedOldValue"]
		revealAfterSet, err := readOptionalBoolArgument(arguments, "revealAfterSet")
		if err != nil {
			return nil, err
		}
		durationMS := 3000
		if resolvedDuration, err := readOptionalIntArgument(arguments, "durationMs"); err != nil {
			return nil, err
		} else if resolvedDuration != nil {
			durationMS = *resolvedDuration
		}

		entry, ok, err := registry.Get(settingID)
		if err != nil {
			return nil, newToolError("invalid_arguments", "%s", err.Error())
		}
		if !ok {
			missingErr := registry.MissingSettingError(settingID)
			errorResult := normalizeUISettingRuntimeError(missingErr, settingID, "write")
			return setUISettingValueResult{
				OldValue:        nil,
				NewValue:        nil,
				NormalizedValue: nil,
				Changed:         false,
				Error:           errorResult,
			}, nil
		}

		summary := summaryPointer(buildUISettingResultSummary(entry.Metadata))
		if entry.Metadata.Mutability != uisettings.MutabilityWritable || entry.WriteValue == nil {
			return setUISettingValueResult{
				Setting:         summary,
				OldValue:        nil,
				NewValue:        nil,
				NormalizedValue: nil,
				Changed:         false,
				Error: newUISettingToolErrorResult(
					uisettings.ErrorCodeSettingReadOnly,
					fmt.Sprintf("UI setting %q is read-only.", entry.Metadata.SettingID),
				),
			}, nil
		}

		currentValue, err := registry.ReadValue(ctx, projectConfigID, entry.Metadata.SettingID)
		if err != nil {
			return setUISettingValueResult{
				Setting:         summary,
				OldValue:        nil,
				NewValue:        nil,
				NormalizedValue: nil,
				Changed:         false,
				Error:           normalizeUISettingRuntimeError(err, entry.Metadata.SettingID, "read"),
			}, nil
		}

		writerExpectedOldValue := currentValue
		if hasExpectedOldValue {
			writerExpectedOldValue = expectedOldValue
		}
		result, err := registry.WriteValue(ctx, projectConfigID, entry.Metadata.SettingID, value, writerExpectedOldValue)
		if err != nil {
			return setUISettingValueResult{
				Setting:         summary,
				OldValue:        currentValue,
				NewValue:        nil,
				NormalizedValue: nil,
				Changed:         false,
				Error:           normalizeUISettingRuntimeError(err, entry.Metadata.SettingID, "write"),
			}, nil
		}
		if !reflect.DeepEqual(result.OldValue, currentValue) {
			return setUISettingValueResult{
				Setting:         summary,
				OldValue:        currentValue,
				NewValue:        result.NewValue,
				NormalizedValue: result.NormalizedValue,
				Changed:         false,
				Error: newUISettingToolErrorResult(
					uisettings.ErrorCodeMutationFailed,
					fmt.Sprintf("Failed to write %s: writer old value drifted from the current persisted value.", entry.Metadata.SettingID),
				),
			}, nil
		}

		payload := setUISettingValueResult{
			Setting:         summary,
			OldValue:        result.OldValue,
			NewValue:        result.NewValue,
			NormalizedValue: result.NormalizedValue,
			Changed:         result.Changed,
		}
		if revealAfterSet {
			revealResult, err := runUISettingReveal(
				server,
				ctx,
				registry,
				projectConfigID,
				entry.Metadata.SettingID,
				"",
				durationMS,
			)
			if err != nil {
				return nil, err
			}
			payload.Reveal = &revealResult
		}

		return payload, nil
	}
}

func newRevealUISettingHandler(server *Server, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			server.projectState,
			server.pluginMutations,
			workspaceRoot,
			"Scoped UI-setting reveal",
		)
		if err != nil {
			return nil, err
		}

		settingID, err := readRequiredStringArgument(arguments, "settingId")
		if err != nil {
			return nil, err
		}
		sectionIDToActivate, err := readOptionalNonBlankStringArgument(arguments, "sectionIdToActivate")
		if err != nil {
			return nil, err
		}

		durationMS := 3000
		if resolvedDuration, err := readOptionalIntArgument(arguments, "durationMs"); err != nil {
			return nil, err
		} else if resolvedDuration != nil {
			durationMS = *resolvedDuration
		}

		return runUISettingReveal(server, ctx, registry, projectConfigID, settingID, sectionIDToActivate, durationMS)
	}
}

func runUISettingReveal(
	server *Server,
	ctx context.Context,
	registry *uisettings.Registry,
	projectConfigID string,
	settingID string,
	sectionIDToActivate string,
	durationMS int,
) (revealUISettingResult, error) {
	if server == nil || server.uiSettingReveals == nil {
		return revealUISettingResult{}, newToolError("internal_error", "UI setting reveal runtime is unavailable.")
	}

	invocation, ok := ToolInvocationFromContext(ctx)
	if !ok || invocation.ProjectView == nil || invocation.AgenticContext == nil {
		return revealUISettingResult{}, newToolError("internal_error", "Scoped UI-setting reveal invocation context is unavailable.")
	}

	result, err := server.uiSettingReveals.Reveal(ctx, uisettings.RevealInput{
		ProjectConfigID:       projectConfigID,
		ProjectView:           invocation.ProjectView,
		Registry:              registry,
		SettingID:             settingID,
		SectionIDToActivate:   sectionIDToActivate,
		ContextSectionID:      invocation.AgenticContext.SectionID,
		ChatID:                invocation.AgenticContext.ChatID,
		ShareSessionID:        invocation.AgenticContext.ShareSessionID,
		FrontendAffinityToken: invocation.AgenticContext.FrontendAffinityToken,
		DurationMS:            durationMS,
	})
	if err != nil {
		return revealUISettingResult{}, newToolError("internal_error", "UI setting reveal failed: %s", err.Error())
	}

	payload := revealUISettingResult{
		RequestID:          result.RequestID,
		ProjectConfigID:    result.ProjectConfigID,
		DurationMS:         result.DurationMS,
		EmittedRevealCount: result.EmittedRevealCount,
		Statuses:           make([]revealUISettingStatusResult, 0, len(result.Statuses)),
	}
	for _, status := range result.Statuses {
		payloadStatus := revealUISettingStatusResult{
			SettingID: status.SettingID,
			Status:    status.Status,
			Target:    cloneRevealTarget(status.Target),
		}
		if status.Error != nil {
			payloadStatus.Error = newUISettingToolErrorResult(status.Error.Code, status.Error.Message)
		}
		payload.Statuses = append(payload.Statuses, payloadStatus)
	}
	return payload, nil
}

func resolveScopedUISettingRegistry(
	ctx context.Context,
	arguments map[string]any,
	projectState projectStateProvider,
	pluginMutations pluginMutationProvider,
	workspaceRoot string,
	operation string,
) (string, *uisettings.Registry, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return "", nil, err
	}
	if projectState == nil {
		return "", nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
	}

	invocation, ok := ToolInvocationFromContext(ctx)
	if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
		return "", nil, newToolError("internal_error", "%s invocation context is unavailable.", operation)
	}
	if projectConfigID != invocation.AgenticContext.ProjectConfigID {
		return "", nil, newToolError(
			"invalid_arguments",
			"projectConfigId argument %q does not match agentic context projectConfigId %q.",
			projectConfigID,
			invocation.AgenticContext.ProjectConfigID,
		)
	}

	registry, err := uisettings.NewScopedRegistry(projectState, workspaceRoot, pluginMutations)
	if err != nil {
		return "", nil, newToolError("internal_error", "UI setting registry is unavailable: %s", err.Error())
	}
	return projectConfigID, registry, nil
}

func readUISettingSourceFilterArgument(arguments map[string]any) (uisettings.SourceFilter, error) {
	rawValue, ok := arguments["sourceFilter"]
	if !ok || rawValue == nil {
		return uisettings.SourceFilterAll, nil
	}

	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "sourceFilter must be a string")
	}
	switch strings.TrimSpace(value) {
	case string(uisettings.SourceFilterAll):
		return uisettings.SourceFilterAll, nil
	case string(uisettings.SourceFilterCore):
		return uisettings.SourceFilterCore, nil
	case string(uisettings.SourceFilterPlugin):
		return uisettings.SourceFilterPlugin, nil
	default:
		return "", newToolError("invalid_arguments", "sourceFilter must be one of: core, plugin, all")
	}
}

func normalizeUISettingRuntimeError(err error, settingID string, action string) *uiSettingToolErrorResult {
	var settingErr *uisettings.SettingError
	if errors.As(err, &settingErr) {
		return newUISettingToolErrorResult(settingErr.Code, settingErr.Message)
	}
	return newUISettingToolErrorResult(
		uisettings.ErrorCodeMutationFailed,
		fmt.Sprintf("Failed to %s %s: %v", action, settingID, err),
	)
}

func newUISettingToolErrorResult(code uisettings.ErrorCode, message string) *uiSettingToolErrorResult {
	return &uiSettingToolErrorResult{
		Code:    string(code),
		Message: message,
	}
}

func buildUISettingResultSummary(entry uisettings.Entry) uiSettingResultSummary {
	summary := uiSettingResultSummary{
		SettingID:   entry.SettingID,
		Title:       entry.Title,
		Description: entry.Description,
		Source:      string(entry.Source),
		Mutability:  string(entry.Mutability),
		Location:    entry.Location,
		ValueSchema: entry.ValueSchema,
	}
	if pluginID := strings.TrimSpace(entry.PluginID); pluginID != "" {
		summary.PluginID = cloneStringPtr(&pluginID)
	}
	return summary
}

func summaryPointer(summary uiSettingResultSummary) *uiSettingResultSummary {
	return &summary
}

func cloneRevealTarget(value *realtime.UISettingRevealTarget) *realtime.UISettingRevealTarget {
	if value == nil {
		return nil
	}
	cloned := *value
	if value.OverviewTabKey != nil {
		cloned.OverviewTabKey = cloneStringPtr(value.OverviewTabKey)
	}
	if value.UIEditorTabName != nil {
		cloned.UIEditorTabName = cloneStringPtr(value.UIEditorTabName)
	}
	if value.PluginID != nil {
		cloned.PluginID = cloneStringPtr(value.PluginID)
	}
	if value.PaneID != nil {
		cloned.PaneID = cloneStringPtr(value.PaneID)
	}
	if value.AnchorID != nil {
		cloned.AnchorID = cloneStringPtr(value.AnchorID)
	}
	if value.PluginRevealKey != nil {
		cloned.PluginRevealKey = cloneStringPtr(value.PluginRevealKey)
	}
	cloned.RevealActivationSteps = append([]realtime.UISettingRevealActivationStep(nil), value.RevealActivationSteps...)
	return &cloned
}

func uiSettingErrorSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"code": map[string]any{
				"type": "string",
			},
			"message": map[string]any{
				"type": "string",
			},
		},
		"required": []string{"code", "message"},
	}
}

func uiSettingLocationSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"side": map[string]any{
				"type": "string",
			},
			"overviewTabKey": map[string]any{
				"type": "string",
			},
			"uiEditorTabName": map[string]any{
				"type": "string",
			},
			"pluginId": map[string]any{
				"type": "string",
			},
			"paneId": map[string]any{
				"type": "string",
			},
			"requiresSectionSelection": map[string]any{
				"type": "boolean",
			},
			"preferredSectionType": map[string]any{
				"type": "string",
			},
		},
		"required": []string{"side"},
	}
}

func uiSettingValueSchemaSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"type": map[string]any{
				"type": "string",
			},
			"enumValues": map[string]any{
				"type": "array",
			},
			"minimum": map[string]any{
				"type": "number",
			},
			"maximum": map[string]any{
				"type": "number",
			},
			"minLength": map[string]any{
				"type": "integer",
			},
			"maxLength": map[string]any{
				"type": "integer",
			},
			"items": map[string]any{
				"type": "object",
			},
			"properties": map[string]any{
				"type": "object",
			},
			"requiredProperties": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "string",
				},
			},
			"additionalProperties": map[string]any{
				"type": "boolean",
			},
		},
		"required": []string{"type"},
	}
}

func uiSettingSummarySchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"settingId": map[string]any{
				"type": "string",
			},
			"title": map[string]any{
				"type": "string",
			},
			"description": map[string]any{
				"type": "string",
			},
			"source": map[string]any{
				"type": "string",
			},
			"pluginId": map[string]any{
				"type": "string",
			},
			"mutability": map[string]any{
				"type": "string",
			},
			"location":    uiSettingLocationSchema(),
			"valueSchema": uiSettingValueSchemaSchema(),
		},
		"required": []string{"settingId", "title", "description", "source", "mutability", "location", "valueSchema"},
	}
}

func uiSettingRevealActivationStepSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"type": map[string]any{
				"type": "string",
			},
			"itemValue": map[string]any{
				"type": "string",
			},
		},
		"required": []string{"type", "itemValue"},
	}
}

func uiSettingRevealTargetSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"settingId": map[string]any{
				"type": "string",
			},
			"side": map[string]any{
				"type": "string",
			},
			"overviewTabKey": map[string]any{
				"type": "string",
			},
			"uiEditorTabName": map[string]any{
				"type": "string",
			},
			"pluginId": map[string]any{
				"type": "string",
			},
			"paneId": map[string]any{
				"type": "string",
			},
			"strategy": map[string]any{
				"type": "string",
			},
			"anchorId": map[string]any{
				"type": "string",
			},
			"pluginRevealKey": map[string]any{
				"type": "string",
			},
			"revealActivationSteps": map[string]any{
				"type":  "array",
				"items": uiSettingRevealActivationStepSchema(),
			},
		},
		"required": []string{"settingId", "side", "strategy"},
	}
}

func uiSettingRevealStatusSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"settingId": map[string]any{
				"type": "string",
			},
			"status": map[string]any{
				"type": "string",
			},
			"target": uiSettingRevealTargetSchema(),
			"error":  uiSettingErrorSchema(),
		},
		"required": []string{"settingId", "status"},
	}
}

func uiSettingRevealResultSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"requestId": map[string]any{
				"type": "string",
			},
			"projectConfigId": map[string]any{
				"type": "string",
			},
			"durationMs": map[string]any{
				"type": "integer",
			},
			"emittedRevealCount": map[string]any{
				"type": "integer",
			},
			"statuses": map[string]any{
				"type":  "array",
				"items": uiSettingRevealStatusSchema(),
			},
		},
		"required": []string{"requestId", "projectConfigId", "durationMs", "emittedRevealCount", "statuses"},
	}
}
