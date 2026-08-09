package projectstate

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
)

type ExpectedOldValueMismatchError struct {
	SettingID        string
	ExpectedOldValue any
	ObservedOldValue any
}

type CompareAndSetResult[T any] struct {
	OldValue T `json:"oldValue"`
	NewValue T `json:"newValue"`
}

func (e *ExpectedOldValueMismatchError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf(
		"UI setting %s changed since pre-write validation. Retry with a fresh read before writing.",
		e.SettingID,
	)
}

func IsExpectedOldValueMismatchError(err error) bool {
	var mismatch *ExpectedOldValueMismatchError
	return errors.As(err, &mismatch)
}

func (d *Document) CompareAndSetShowParamDisplayNames(
	projectID string,
	show bool,
	expectedOldValue *bool,
) (CompareAndSetResult[bool], error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CompareAndSetResult[bool]{}, err
	}

	oldValue := project.ShowParamDisplayNames
	if noop, err := isUISettingCompareAndSetNoop(
		"core.project.show_param_display_names",
		optionalBoolAny(expectedOldValue),
		oldValue,
		show,
	); err != nil {
		return CompareAndSetResult[bool]{}, err
	} else if noop {
		return CompareAndSetResult[bool]{OldValue: oldValue, NewValue: oldValue}, nil
	}

	if err := d.SetShowParamDisplayNames(projectID, show); err != nil {
		return CompareAndSetResult[bool]{}, err
	}
	return CompareAndSetResult[bool]{OldValue: oldValue, NewValue: show}, nil
}

func (r *Runtime) CompareAndSetShowParamDisplayNames(
	ctx context.Context,
	projectID string,
	show bool,
	expectedOldValue *bool,
) (Snapshot, CompareAndSetResult[bool], error) {
	return mutateAndSaveIfChanged(r, ctx, func(document Document) (Document, CompareAndSetResult[bool], error) {
		result, err := document.CompareAndSetShowParamDisplayNames(projectID, show, expectedOldValue)
		return document, result, err
	})
}

func (d *Document) CompareAndSetProjectName(
	projectID string,
	name string,
	expectedOldValue *string,
) (CompareAndSetResult[string], error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CompareAndSetResult[string]{}, err
	}

	oldValue := project.Name
	if noop, err := isUISettingCompareAndSetNoop(
		"core.project.name",
		optionalStringAny(expectedOldValue),
		oldValue,
		name,
	); err != nil {
		return CompareAndSetResult[string]{}, err
	} else if noop {
		return CompareAndSetResult[string]{OldValue: oldValue, NewValue: oldValue}, nil
	}

	if err := d.SetProjectName(projectID, name); err != nil {
		return CompareAndSetResult[string]{}, err
	}
	return CompareAndSetResult[string]{OldValue: oldValue, NewValue: name}, nil
}

func (r *Runtime) CompareAndSetProjectName(
	ctx context.Context,
	projectID string,
	name string,
	expectedOldValue *string,
) (Snapshot, CompareAndSetResult[string], error) {
	return mutateAndSaveIfChanged(r, ctx, func(document Document) (Document, CompareAndSetResult[string], error) {
		result, err := document.CompareAndSetProjectName(projectID, name, expectedOldValue)
		return document, result, err
	})
}

func (d *Document) CompareAndSetPythonCodegenEnabled(
	ctx context.Context,
	projectID string,
	enabled bool,
	expectedOldValue *bool,
	validator CodegenTargetValidator,
	pythonReconciler PythonCodegenSectionReconciler,
) (CompareAndSetResult[bool], error) {
	if ctx == nil {
		ctx = context.Background()
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CompareAndSetResult[bool]{}, err
	}

	oldValue := project.HasPythonCodegenTarget()
	if noop, err := isUISettingCompareAndSetNoop(
		"core.run_instructions.python_codegen_enabled",
		optionalBoolAny(expectedOldValue),
		oldValue,
		enabled,
	); err != nil {
		return CompareAndSetResult[bool]{}, err
	} else if noop {
		return CompareAndSetResult[bool]{OldValue: oldValue, NewValue: oldValue}, nil
	}

	if err := d.SetProjectCodegenTargets(
		ctx,
		projectID,
		projectCodegenTargetsWithPythonEnabled(project.CodegenTargets, enabled),
		validator,
		pythonReconciler,
	); err != nil {
		return CompareAndSetResult[bool]{}, err
	}
	return CompareAndSetResult[bool]{OldValue: oldValue, NewValue: enabled}, nil
}

func (r *Runtime) CompareAndSetPythonCodegenEnabled(
	ctx context.Context,
	projectID string,
	enabled bool,
	expectedOldValue *bool,
	validator CodegenTargetValidator,
	pythonReconciler PythonCodegenSectionReconciler,
) (Snapshot, CompareAndSetResult[bool], error) {
	return mutateAndSaveIfChanged(r, ctx, func(document Document) (Document, CompareAndSetResult[bool], error) {
		result, err := document.CompareAndSetPythonCodegenEnabled(
			ctx,
			projectID,
			enabled,
			expectedOldValue,
			validator,
			pythonReconciler,
		)
		return document, result, err
	})
}

func mutateAndSaveIfChanged[T any](
	r *Runtime,
	ctx context.Context,
	mutate func(Document) (Document, T, error),
) (Snapshot, T, error) {
	var zero T
	if r == nil {
		return Snapshot{}, zero, ErrRuntimeClosed
	}
	if mutate == nil {
		return Snapshot{}, zero, ErrMutationMissing
	}

	var output T
	snapshot, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			nextDocument, result, err := mutate(state.current.Clone())
			if err != nil {
				return snapshotFromState(*state), err
			}
			output = result

			normalized, err := nextDocument.Normalized()
			if err != nil {
				return snapshotFromState(*state), err
			}
			if !documentsEqualForRuntimeState(state.current, normalized) {
				state.current = normalized.Clone()
				state.revision++
				snapshot := snapshotFromState(*state)
				return snapshot, r.persistSnapshot(ctx, snapshot)
			}

			return snapshotFromState(*state), nil
		},
	})
	return snapshot, output, err
}

func isUISettingCompareAndSetNoop(
	settingID string,
	expectedOldValue any,
	observedOldValue any,
	requestedNewValue any,
) (bool, error) {
	if err := assertUISettingExpectedOldValueMatches(settingID, expectedOldValue, observedOldValue); err != nil {
		return false, err
	}
	return reflect.DeepEqual(observedOldValue, requestedNewValue), nil
}

func assertUISettingExpectedOldValueMatches(settingID string, expectedOldValue any, observedOldValue any) error {
	if expectedOldValue == nil {
		return nil
	}
	if reflect.DeepEqual(expectedOldValue, observedOldValue) {
		return nil
	}
	return &ExpectedOldValueMismatchError{
		SettingID:        settingID,
		ExpectedOldValue: expectedOldValue,
		ObservedOldValue: observedOldValue,
	}
}

func optionalBoolAny(value *bool) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalStringAny(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func projectCodegenTargetsWithPythonEnabled(targets []ProjectCodegenTarget, enabled bool) []ProjectCodegenTarget {
	next := make([]ProjectCodegenTarget, 0, len(targets)+1)
	hasPython := false
	for _, target := range targets {
		if strings.TrimSpace(target.Language) == string(CodeLanguagePython) {
			hasPython = true
			if enabled {
				next = append(next, target.Clone())
			}
			continue
		}
		next = append(next, target.Clone())
	}
	if enabled && !hasPython {
		next = append(next, ProjectCodegenTarget{
			Language: string(CodeLanguagePython),
		})
	}
	return next
}
