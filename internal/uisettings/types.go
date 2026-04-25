package uisettings

import (
	"context"

	"setta/internal/projectstate"
)

type Source string

const (
	SourceCore   Source = "core"
	SourcePlugin Source = "plugin"
)

type SourceFilter string

const (
	SourceFilterCore   SourceFilter = "core"
	SourceFilterPlugin SourceFilter = "plugin"
	SourceFilterAll    SourceFilter = "all"
)

type Mutability string

const (
	MutabilityReadOnly Mutability = "readOnly"
	MutabilityWritable Mutability = "writable"
)

type Side string

const (
	SideLeft  Side = "left"
	SideRight Side = "right"
)

type HighlightStrategy string

const (
	HighlightStrategyDOMAnchor     HighlightStrategy = "dom_anchor"
	HighlightStrategyPluginHandler HighlightStrategy = "plugin_handler"
)

type RevealActivationType string

const (
	RevealActivationProjectAIAccordion RevealActivationType = "project_ai_settings_accordion_item"
	RevealActivationRunInstructions    RevealActivationType = "run_instructions_accordion_item"
)

type ValueType string

const (
	ValueTypeBoolean ValueType = "boolean"
	ValueTypeString  ValueType = "string"
	ValueTypeNumber  ValueType = "number"
	ValueTypeInteger ValueType = "integer"
	ValueTypeArray   ValueType = "array"
	ValueTypeObject  ValueType = "object"
)

type ErrorCode string

const (
	ErrorCodeSettingNotFound         ErrorCode = "setting_not_found"
	ErrorCodeSettingReadOnly         ErrorCode = "setting_read_only"
	ErrorCodeInvalidValueType        ErrorCode = "invalid_value_type"
	ErrorCodeInvalidValueRangeOrEnum ErrorCode = "invalid_value_range_or_enum"
	ErrorCodePluginUnavailable       ErrorCode = "plugin_unavailable"
	ErrorCodeMutationFailed          ErrorCode = "mutation_failed"
)

type Location struct {
	Side                     Side   `json:"side"`
	OverviewTabKey           string `json:"overviewTabKey,omitempty"`
	UIEditorTabName          string `json:"uiEditorTabName,omitempty"`
	PluginID                 string `json:"pluginId,omitempty"`
	PaneID                   string `json:"paneId,omitempty"`
	RequiresSectionSelection bool   `json:"requiresSectionSelection,omitempty"`
	PreferredSectionType     string `json:"preferredSectionType,omitempty"`
}

type Highlight struct {
	Strategy        HighlightStrategy `json:"strategy"`
	AnchorID        string            `json:"anchorId,omitempty"`
	PluginRevealKey string            `json:"pluginRevealKey,omitempty"`
}

type RevealActivationStep struct {
	Type      RevealActivationType `json:"type"`
	ItemValue string               `json:"itemValue"`
}

type ValueSchema struct {
	Type                 ValueType              `json:"type"`
	EnumValues           []any                  `json:"enumValues,omitempty"`
	Minimum              *float64               `json:"minimum,omitempty"`
	Maximum              *float64               `json:"maximum,omitempty"`
	MinLength            *int                   `json:"minLength,omitempty"`
	MaxLength            *int                   `json:"maxLength,omitempty"`
	Items                *ValueSchema           `json:"items,omitempty"`
	Properties           map[string]ValueSchema `json:"properties,omitempty"`
	RequiredProperties   []string               `json:"requiredProperties,omitempty"`
	AdditionalProperties *bool                  `json:"additionalProperties,omitempty"`
}

type Entry struct {
	SettingID             string                 `json:"settingId"`
	Title                 string                 `json:"title"`
	Synonyms              []string               `json:"synonyms,omitempty"`
	Description           string                 `json:"description"`
	Location              Location               `json:"location"`
	Highlight             Highlight              `json:"highlight"`
	Source                Source                 `json:"source"`
	PluginID              string                 `json:"pluginId,omitempty"`
	Mutability            Mutability             `json:"mutability"`
	ValueSchema           ValueSchema            `json:"valueSchema"`
	RevealActivationSteps []RevealActivationStep `json:"revealActivationSteps,omitempty"`
}

type MutationResult struct {
	OldValue        any  `json:"oldValue"`
	NewValue        any  `json:"newValue"`
	NormalizedValue any  `json:"normalizedValue"`
	Changed         bool `json:"changed"`
}

type ReadFunc func(context.Context, string) (any, error)

type WriteFunc func(context.Context, string, any, any) (MutationResult, error)

type RuntimeEntry struct {
	Metadata   Entry
	ReadValue  ReadFunc
	WriteValue WriteFunc
}

type CoreProjectState interface {
	Snapshot() projectstate.Snapshot
	SetProjectName(ctx context.Context, projectID string, name string) (projectstate.Snapshot, error)
	SetProjectCodegenTargets(ctx context.Context, projectID string, targets []projectstate.ProjectCodegenTarget, validator projectstate.CodegenTargetValidator, pythonReconciler projectstate.PythonCodegenSectionReconciler) (projectstate.Snapshot, error)
	CompareAndSetProjectName(ctx context.Context, projectID string, name string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetShowParamDisplayNames(ctx context.Context, projectID string, show bool, expectedOldValue *bool) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
	CompareAndSetPythonCodegenEnabled(ctx context.Context, projectID string, enabled bool, expectedOldValue *bool, validator projectstate.CodegenTargetValidator, pythonReconciler projectstate.PythonCodegenSectionReconciler) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
	CompareAndSetWatchCodeEnabled(ctx context.Context, providerPluginID string, projectID string, enabled bool, workspaceRoot string, expectedOldValue *bool) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
	CompareAndSetWatchCodeFolders(ctx context.Context, providerPluginID string, projectID string, folders []projectstate.WatchCodeFolder, workspaceRoot string, expectedOldValue []projectstate.WatchCodeFolder) (projectstate.Snapshot, projectstate.CompareAndSetResult[[]projectstate.WatchCodeFolder], error)
	CompareAndSetWatchCodeFiles(ctx context.Context, providerPluginID string, projectID string, files []string, workspaceRoot string, expectedOldValue []string) (projectstate.Snapshot, projectstate.CompareAndSetResult[[]string], error)
}
