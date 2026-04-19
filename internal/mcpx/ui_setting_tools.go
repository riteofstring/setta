package mcpx

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"setta/internal/plugins"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/uisettings"
	appsubsystemuisettings "setta/plugins/setta-json-render-app-gen/backend/appuisettings"
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

type setUISettingValueRequest struct {
	SettingID           string
	Value               any
	ExpectedOldValue    any
	HasExpectedOldValue bool
	RevealAfterSet      bool
	DurationMS          int
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

func newSearchUISettingsHandler(server *Server, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		_, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			server,
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

func newGetUISettingValueHandler(server *Server, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			server,
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

func newSetUISettingValueHandler(server *Server, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			server,
			workspaceRoot,
			"Scoped UI-setting write",
		)
		if err != nil {
			return nil, err
		}

		request, err := readSetUISettingValueRequest(arguments)
		if err != nil {
			return nil, err
		}
		entry, summary, earlyResult, err := resolveSetUISettingWriteTarget(registry, request.SettingID)
		if err != nil {
			return nil, err
		}
		if earlyResult != nil {
			return *earlyResult, nil
		}

		currentValue, earlyResult := readCurrentUISettingValueForWrite(ctx, registry, projectConfigID, entry, summary)
		if earlyResult != nil {
			return *earlyResult, nil
		}

		payload := applySetUISettingValueWrite(ctx, registry, projectConfigID, entry, summary, request, currentValue)
		if payload.Error != nil || !request.RevealAfterSet {
			return payload, nil
		}

		revealResult, err := runUISettingReveal(
			server,
			ctx,
			registry,
			projectConfigID,
			entry.Metadata.SettingID,
			"",
			request.DurationMS,
		)
		if err != nil {
			return nil, err
		}
		payload.Reveal = &revealResult
		return payload, nil
	}
}

func readSetUISettingValueRequest(arguments map[string]any) (setUISettingValueRequest, error) {
	settingID, err := readRequiredStringArgument(arguments, "settingId")
	if err != nil {
		return setUISettingValueRequest{}, err
	}
	value, err := readRequiredPresentArgument(arguments, "value")
	if err != nil {
		return setUISettingValueRequest{}, err
	}
	revealAfterSet, err := readOptionalBoolArgument(arguments, "revealAfterSet")
	if err != nil {
		return setUISettingValueRequest{}, err
	}
	durationMS := 3000
	if resolvedDuration, err := readOptionalIntArgument(arguments, "durationMs"); err != nil {
		return setUISettingValueRequest{}, err
	} else if resolvedDuration != nil {
		durationMS = *resolvedDuration
	}
	expectedOldValue, hasExpectedOldValue := arguments["expectedOldValue"]
	return setUISettingValueRequest{
		SettingID:           settingID,
		Value:               value,
		ExpectedOldValue:    expectedOldValue,
		HasExpectedOldValue: hasExpectedOldValue,
		RevealAfterSet:      revealAfterSet,
		DurationMS:          durationMS,
	}, nil
}

func resolveSetUISettingWriteTarget(
	registry *uisettings.Registry,
	settingID string,
) (uisettings.RuntimeEntry, *uiSettingResultSummary, *setUISettingValueResult, error) {
	entry, ok, err := registry.Get(settingID)
	if err != nil {
		return uisettings.RuntimeEntry{}, nil, nil, newToolError("invalid_arguments", "%s", err.Error())
	}
	if !ok {
		missingErr := registry.MissingSettingError(settingID)
		return uisettings.RuntimeEntry{}, nil, &setUISettingValueResult{
			OldValue:        nil,
			NewValue:        nil,
			NormalizedValue: nil,
			Changed:         false,
			Error:           normalizeUISettingRuntimeError(missingErr, settingID, "write"),
		}, nil
	}

	summary := summaryPointer(buildUISettingResultSummary(entry.Metadata))
	if entry.Metadata.Mutability != uisettings.MutabilityWritable || entry.WriteValue == nil {
		return uisettings.RuntimeEntry{}, nil, &setUISettingValueResult{
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
	return entry, summary, nil, nil
}

func readCurrentUISettingValueForWrite(
	ctx context.Context,
	registry *uisettings.Registry,
	projectConfigID string,
	entry uisettings.RuntimeEntry,
	summary *uiSettingResultSummary,
) (any, *setUISettingValueResult) {
	currentValue, err := registry.ReadValue(ctx, projectConfigID, entry.Metadata.SettingID)
	if err != nil {
		return nil, &setUISettingValueResult{
			Setting:         summary,
			OldValue:        nil,
			NewValue:        nil,
			NormalizedValue: nil,
			Changed:         false,
			Error: normalizeUISettingRuntimeError(
				normalizePreWriteUISettingReadError(err, entry),
				entry.Metadata.SettingID,
				"read",
			),
		}
	}
	return currentValue, nil
}

func normalizePreWriteUISettingReadError(err error, entry uisettings.RuntimeEntry) error {
	if entry.Metadata.Source == uisettings.SourcePlugin && entry.WriteValue != nil {
		return uisettings.RecontextualizePluginBackendInvalidValueError(
			err,
			"pre-write oldValue read returned an invalid value",
		)
	}
	return err
}

func applySetUISettingValueWrite(
	ctx context.Context,
	registry *uisettings.Registry,
	projectConfigID string,
	entry uisettings.RuntimeEntry,
	summary *uiSettingResultSummary,
	request setUISettingValueRequest,
	currentValue any,
) setUISettingValueResult {
	writerExpectedOldValue := currentValue
	if request.HasExpectedOldValue {
		writerExpectedOldValue = request.ExpectedOldValue
	}

	result, err := registry.WriteValue(ctx, projectConfigID, entry.Metadata.SettingID, request.Value, writerExpectedOldValue)
	if err != nil {
		return setUISettingValueResult{
			Setting:         summary,
			OldValue:        currentValue,
			NewValue:        nil,
			NormalizedValue: nil,
			Changed:         false,
			Error:           normalizeUISettingRuntimeError(err, entry.Metadata.SettingID, "write"),
		}
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
		}
	}

	return setUISettingValueResult{
		Setting:         summary,
		OldValue:        result.OldValue,
		NewValue:        result.NewValue,
		NormalizedValue: result.NormalizedValue,
		Changed:         result.Changed,
	}
}

func newRevealUISettingHandler(server *Server, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, registry, err := resolveScopedUISettingRegistry(
			ctx,
			arguments,
			server,
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
	server *Server,
	workspaceRoot string,
	operation string,
) (string, *uisettings.Registry, error) {
	if server == nil {
		return "", nil, newToolError("internal_error", "UI setting server is unavailable.")
	}
	projectState := server.projectState
	if projectState == nil {
		return "", nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
	}

	invocation, ok := ToolInvocationFromContext(ctx)
	if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
		return "", nil, newToolError("internal_error", "%s invocation context is unavailable.", operation)
	}
	projectConfigID, err := resolveScopedProjectConfigIDArgument(arguments, invocation)
	if err != nil {
		return "", nil, err
	}
	if projectConfigID != invocation.AgenticContext.ProjectConfigID {
		return "", nil, newToolError(
			"invalid_arguments",
			"projectConfigId argument %q does not match agentic context projectConfigId %q.",
			projectConfigID,
			invocation.AgenticContext.ProjectConfigID,
		)
	}

	registry, err := uisettings.NewScopedRegistry(uisettings.ScopedRegistryOptions{
		Runtime:                  projectState,
		WorkspaceRoot:            workspaceRoot,
		PluginService:            server.pluginMutations,
		ProjectAISettings:        buildProjectAISettingProviders(server),
		ContributedEntryBuilders: buildScopedUISettingEntryBuilders(server),
	})
	if err != nil {
		return "", nil, newToolError("internal_error", "UI setting registry is unavailable: %s", err.Error())
	}
	return projectConfigID, registry, nil
}

func buildScopedUISettingEntryBuilders(server *Server) []uisettings.RuntimeEntryBuilder {
	if server == nil || server.appDefinitionService == nil {
		return nil
	}
	return []uisettings.RuntimeEntryBuilder{
		func(runtime plugins.PluginRuntimeResponse) ([]uisettings.RuntimeEntry, error) {
			if runtime.FeatureCapabilities == nil || !runtime.FeatureCapabilities.AppSubsystem.PluginEnabled {
				return nil, nil
			}
			return appsubsystemuisettings.BuildEntries(server.appDefinitionService)
		},
	}
}

func buildProjectAISettingProviders(server *Server) uisettings.ProjectAISettingProviders {
	if server == nil {
		return uisettings.ProjectAISettingProviders{}
	}
	return uisettings.ProjectAISettingProviders{
		LLMAPIKeys: func(context.Context) (int, error) {
			if server.llmAPIKeys == nil {
				return 0, fmt.Errorf("llm api key runtime is unavailable")
			}
			snapshot := server.llmAPIKeys.ManagedAPIKeysSnapshot()
			if snapshot.ErrorCode != nil {
				return 0, fmt.Errorf("managed api keys unavailable (%s)", *snapshot.ErrorCode)
			}
			return len(snapshot.APIKeys), nil
		},
		AgentProfiles: func(context.Context) (int, error) {
			if server.agentProfiles == nil {
				return 0, fmt.Errorf("agent profile store is unavailable")
			}
			profiles, err := server.agentProfiles.List()
			if err != nil {
				return 0, err
			}
			return len(profiles), nil
		},
		PromptTemplates: func(context.Context) (int, error) {
			if server.promptTemplates == nil {
				return 0, fmt.Errorf("prompt template store is unavailable")
			}
			templates, err := server.promptTemplates.List()
			if err != nil {
				return 0, err
			}
			return len(templates), nil
		},
		ExternalAgents: func(context.Context) (int, error) {
			if server.externalAgentConfigs == nil {
				return 0, fmt.Errorf("external agent config store is unavailable")
			}
			configs, err := server.externalAgentConfigs.List()
			if err != nil {
				return 0, err
			}
			return len(configs), nil
		},
	}
}

func resolveScopedProjectConfigIDArgument(arguments map[string]any, invocation ToolInvocationContext) (string, error) {
	if _, ok := arguments["projectConfigId"]; ok {
		return readRequiredStringArgument(arguments, "projectConfigId")
	}
	projectConfigID := strings.TrimSpace(invocation.AgenticContext.ProjectConfigID)
	if projectConfigID == "" {
		return "", newToolError(
			"invalid_arguments",
			"projectConfigId is required when the active agentic context has no project default.",
		)
	}
	return projectConfigID, nil
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
