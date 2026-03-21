package projectstate

import (
	"context"
	"errors"
	"fmt"
	"reflect"
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

func (d *Document) CompareAndSetWatchCodeEnabled(
	projectID string,
	enabled bool,
	workspaceRoot string,
	expectedOldValue *bool,
) (CompareAndSetResult[bool], error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CompareAndSetResult[bool]{}, err
	}

	oldValue := project.WatchCodeEnabled
	if noop, err := isUISettingCompareAndSetNoop(
		"core.watch_code.enabled",
		optionalBoolAny(expectedOldValue),
		oldValue,
		enabled,
	); err != nil {
		return CompareAndSetResult[bool]{}, err
	} else if noop {
		return CompareAndSetResult[bool]{OldValue: oldValue, NewValue: oldValue}, nil
	}

	if err := d.SetWatchCodeEnabled(projectID, enabled, workspaceRoot); err != nil {
		return CompareAndSetResult[bool]{}, err
	}
	return CompareAndSetResult[bool]{OldValue: oldValue, NewValue: enabled}, nil
}

func (r *Runtime) CompareAndSetWatchCodeEnabled(
	ctx context.Context,
	projectID string,
	enabled bool,
	workspaceRoot string,
	expectedOldValue *bool,
) (Snapshot, CompareAndSetResult[bool], error) {
	return mutateAndSaveIfChanged(r, ctx, func(document Document) (Document, CompareAndSetResult[bool], error) {
		result, err := document.CompareAndSetWatchCodeEnabled(projectID, enabled, workspaceRoot, expectedOldValue)
		return document, result, err
	})
}

func (d *Document) CompareAndSetWatchCodeFolders(
	projectID string,
	folders []WatchCodeFolder,
	workspaceRoot string,
	expectedOldValue []WatchCodeFolder,
) (CompareAndSetResult[[]WatchCodeFolder], error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CompareAndSetResult[[]WatchCodeFolder]{}, err
	}

	oldFolders := canonicalWatchCodeFolders(project.WatchCodeFolders)
	nextFolders, err := normalizeWatchCodeFolders(workspaceRoot, folders)
	if err != nil {
		return CompareAndSetResult[[]WatchCodeFolder]{}, err
	}
	if noop, err := isUISettingCompareAndSetNoop(
		"core.watch_code.folders",
		optionalWatchCodeFoldersAny(expectedOldValue),
		oldFolders,
		nextFolders,
	); err != nil {
		return CompareAndSetResult[[]WatchCodeFolder]{}, err
	} else if noop {
		return CompareAndSetResult[[]WatchCodeFolder]{
			OldValue: oldFolders,
			NewValue: cloneWatchCodeFolders(oldFolders),
		}, nil
	}

	if err := d.SetWatchCodeInputs(projectID, nextFolders, project.WatchCodeFiles, workspaceRoot); err != nil {
		return CompareAndSetResult[[]WatchCodeFolder]{}, err
	}
	return CompareAndSetResult[[]WatchCodeFolder]{
		OldValue: oldFolders,
		NewValue: cloneWatchCodeFolders(nextFolders),
	}, nil
}

func (r *Runtime) CompareAndSetWatchCodeFolders(
	ctx context.Context,
	projectID string,
	folders []WatchCodeFolder,
	workspaceRoot string,
	expectedOldValue []WatchCodeFolder,
) (Snapshot, CompareAndSetResult[[]WatchCodeFolder], error) {
	return mutateAndSaveIfChanged(r, ctx, func(document Document) (Document, CompareAndSetResult[[]WatchCodeFolder], error) {
		result, err := document.CompareAndSetWatchCodeFolders(projectID, folders, workspaceRoot, expectedOldValue)
		return document, result, err
	})
}

func (d *Document) CompareAndSetWatchCodeFiles(
	projectID string,
	files []string,
	workspaceRoot string,
	expectedOldValue []string,
) (CompareAndSetResult[[]string], error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CompareAndSetResult[[]string]{}, err
	}

	oldFiles := canonicalStringSlice(project.WatchCodeFiles)
	nextFiles, err := normalizeWatchCodeFiles(workspaceRoot, files)
	if err != nil {
		return CompareAndSetResult[[]string]{}, err
	}
	if noop, err := isUISettingCompareAndSetNoop(
		"core.watch_code.files",
		optionalStringSliceAny(expectedOldValue),
		oldFiles,
		nextFiles,
	); err != nil {
		return CompareAndSetResult[[]string]{}, err
	} else if noop {
		return CompareAndSetResult[[]string]{
			OldValue: oldFiles,
			NewValue: append([]string(nil), oldFiles...),
		}, nil
	}

	if err := d.SetWatchCodeInputs(projectID, project.WatchCodeFolders, nextFiles, workspaceRoot); err != nil {
		return CompareAndSetResult[[]string]{}, err
	}
	return CompareAndSetResult[[]string]{
		OldValue: oldFiles,
		NewValue: append([]string(nil), nextFiles...),
	}, nil
}

func (r *Runtime) CompareAndSetWatchCodeFiles(
	ctx context.Context,
	projectID string,
	files []string,
	workspaceRoot string,
	expectedOldValue []string,
) (Snapshot, CompareAndSetResult[[]string], error) {
	return mutateAndSaveIfChanged(r, ctx, func(document Document) (Document, CompareAndSetResult[[]string], error) {
		result, err := document.CompareAndSetWatchCodeFiles(projectID, files, workspaceRoot, expectedOldValue)
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

func optionalStringSliceAny(value []string) any {
	if value == nil {
		return nil
	}
	return canonicalStringSlice(value)
}

func optionalWatchCodeFoldersAny(value []WatchCodeFolder) any {
	if value == nil {
		return nil
	}
	return canonicalWatchCodeFolders(value)
}

func canonicalStringSlice(value []string) []string {
	if len(value) == 0 {
		return []string{}
	}
	return append([]string(nil), value...)
}

func canonicalWatchCodeFolders(value []WatchCodeFolder) []WatchCodeFolder {
	if len(value) == 0 {
		return []WatchCodeFolder{}
	}
	return cloneWatchCodeFolders(value)
}
