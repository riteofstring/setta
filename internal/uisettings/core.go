package uisettings

import (
	"context"
	"strings"

	"setta/internal/projectstate"
)

func NewCoreRegistry(runtime CoreProjectState, workspaceRoot string) (*Registry, error) {
	if runtime == nil {
		return nil, projectstate.ErrRuntimeClosed
	}
	boolSchema := ValueSchema{Type: ValueTypeBoolean}
	nonEmptyStringSchema := ValueSchema{Type: ValueTypeString, MinLength: intPointer(1)}

	entries := []RuntimeEntry{
		NewCompareAndSetEntry(
			Entry{
				SettingID:   "core.project.name",
				Title:       "Project Name",
				Synonyms:    []string{"project name", "config name", "rename project"},
				Description: "Project name shown in the overview header.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameOverview)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.project.name"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: nonEmptyStringSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.Name
			}),
			NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, projectID string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := runtime.CompareAndSetProjectName(ctx, projectID, nextValue, expected)
				return result, err
			},
			ComparableMutationResult[string],
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   "core.project.show_param_display_names",
				Title:       "Show Param Display Names",
				Synonyms:    []string{"display names", "parameter display names", "param names"},
				Description: "Toggle display names for parameters in the right pane.",
				Location:    Location{Side: SideRight, UIEditorTabName: string(UIEditorTabNameQuickInfoConfig), RequiresSectionSelection: true},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.project.show_param_display_names"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: boolSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.ShowParamDisplayNames
			}),
			normalizeBoolWrite(boolSchema),
			func(ctx context.Context, projectID string, show bool, expected *bool) (projectstate.CompareAndSetResult[bool], error) {
				_, result, err := runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expected)
				return result, err
			},
			ComparableMutationResult[bool],
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   "core.run_instructions.python_codegen_enabled",
				Title:       "Python Codegen Enabled",
				Synonyms:    []string{"python codegen", "generated code", "run instructions python"},
				Description: "Enable or disable generated Python code sections for the project.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameRunInstructions)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.run_instructions.python_codegen_enabled"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: boolSchema,
				RevealActivationSteps: []RevealActivationStep{
					{
						Type:      RevealActivationRunInstructions,
						ItemValue: "run-instructions-codegen-targets",
					},
				},
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.HasPythonCodegenTarget()
			}),
			normalizeBoolWrite(boolSchema),
			func(ctx context.Context, projectID string, enabled bool, expected *bool) (projectstate.CompareAndSetResult[bool], error) {
				_, result, err := runtime.CompareAndSetPythonCodegenEnabled(
					ctx,
					projectID,
					enabled,
					expected,
					projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
						return nil
					}),
					projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
						return nil
					}),
				)
				return result, err
			},
			ComparableMutationResult[bool],
		),
	}
	return newRegistry(entries, registryPluginMetadata{})
}

type CompareAndSetEntryNormalizer[Value any, Expected any] func(value any, expectedOldValue any) (Value, Expected, error)
type CompareAndSetEntryWriter[Value any, Expected any, Result any] func(ctx context.Context, projectID string, value Value, expectedOldValue Expected) (projectstate.CompareAndSetResult[Result], error)
type CompareAndSetEntryMutationBuilder[Result any] func(projectstate.CompareAndSetResult[Result]) MutationResult

func NewCompareAndSetEntry[Value any, Expected any, Result any](
	metadata Entry,
	read ReadFunc,
	normalize CompareAndSetEntryNormalizer[Value, Expected],
	write CompareAndSetEntryWriter[Value, Expected, Result],
	buildMutationResult CompareAndSetEntryMutationBuilder[Result],
) RuntimeEntry {
	return RuntimeEntry{
		Metadata:  metadata,
		ReadValue: read,
		WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
			normalizedValue, expected, err := normalize(value, expectedOldValue)
			if err != nil {
				return MutationResult{}, err
			}
			result, err := write(ctx, projectID, normalizedValue, expected)
			if err != nil {
				return MutationResult{}, wrapMutationError(err)
			}
			return buildMutationResult(result), nil
		},
	}
}

func readProjectValue(runtime CoreProjectState, selectValue func(*projectstate.Project) any) ReadFunc {
	return func(_ context.Context, projectID string) (any, error) {
		project, err := runtime.Snapshot().Document.ProjectByID(projectID)
		if err != nil {
			return nil, err
		}
		return selectValue(&project), nil
	}
}

func normalizeBoolWrite(schema ValueSchema) CompareAndSetEntryNormalizer[bool, *bool] {
	return func(value any, expectedOldValue any) (bool, *bool, error) {
		return normalizeOptionalBoolWrite(schema, value, expectedOldValue)
	}
}

func ComparableMutationResult[Value comparable](result projectstate.CompareAndSetResult[Value]) MutationResult {
	return MutationResult{
		OldValue:        result.OldValue,
		NewValue:        result.NewValue,
		NormalizedValue: result.NewValue,
		Changed:         result.OldValue != result.NewValue,
	}
}

func normalizeOptionalBoolWrite(schema ValueSchema, value any, expectedOldValue any) (bool, *bool, error) {
	if err := ValidateValue(schema, value); err != nil {
		return false, nil, err
	}
	normalizedValue := value.(bool)
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	if err := ValidateValue(schema, expectedOldValue); err != nil {
		return false, nil, err
	}
	expected := expectedOldValue.(bool)
	return normalizedValue, &expected, nil
}

func NormalizeOptionalNonEmptyStringWrite(value any, expectedOldValue any) (string, *string, error) {
	normalizedValue, err := normalizeNonEmptyString(value)
	if err != nil {
		return "", nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	expected, err := normalizeNonEmptyString(expectedOldValue)
	if err != nil {
		return "", nil, err
	}
	return normalizedValue, &expected, nil
}

func NormalizeOptionalThemeModeWrite(value any, expectedOldValue any) (string, *string, error) {
	normalizedValue, err := normalizeThemeMode(value)
	if err != nil {
		return "", nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	expected, err := normalizeThemeMode(expectedOldValue)
	if err != nil {
		return "", nil, err
	}
	return normalizedValue, &expected, nil
}

func normalizeNonEmptyString(value any) (string, error) {
	stringValue, ok := value.(string)
	if !ok {
		return "", newSettingError(ErrorCodeInvalidValueType, "Expected a non-empty string value.")
	}
	trimmed := strings.TrimSpace(stringValue)
	if trimmed == "" {
		return "", newSettingError(ErrorCodeInvalidValueType, "Expected a non-empty string value.")
	}
	return trimmed, nil
}

func normalizeThemeMode(value any) (string, error) {
	stringValue, ok := value.(string)
	if !ok {
		return "", newSettingError(ErrorCodeInvalidValueType, "Expected a string value.")
	}
	trimmed := strings.TrimSpace(stringValue)
	switch trimmed {
	case "auto", "dark", "light":
		return trimmed, nil
	default:
		return "", newSettingError(ErrorCodeInvalidValueRangeOrEnum, "Theme mode must be one of: auto, dark, light.")
	}
}

func wrapMutationError(err error) error {
	if err == nil {
		return nil
	}
	if projectstate.IsExpectedOldValueMismatchError(err) {
		return newSettingError(ErrorCodeMutationFailed, "%s", err.Error())
	}
	return err
}

func valueSchemaPointer(schema ValueSchema) *ValueSchema {
	cloned := cloneValueSchema(schema)
	return &cloned
}

func boolPointer(value bool) *bool {
	return &value
}

func intPointer(value int) *int {
	return &value
}
