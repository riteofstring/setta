package projectstate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrProjectCodegenTargetDuplicateLanguage   = errors.New("project codegen target language must be unique")
	ErrProjectCodegenTargetValidatorRequired   = errors.New("project codegen target validator is required for plugin targets")
	ErrProjectCodegenPythonMutationUnsupported = errors.New("python codegen target mutations are not supported in Go yet")
)

type CodegenTargetValidator interface {
	ValidateProjectCodegenTarget(context.Context, ProjectCodegenTarget) error
}

type CodegenTargetValidatorFunc func(context.Context, ProjectCodegenTarget) error

func (f CodegenTargetValidatorFunc) ValidateProjectCodegenTarget(ctx context.Context, target ProjectCodegenTarget) error {
	return f(ctx, target)
}

func (d *Document) SetProjectCodegenTargets(ctx context.Context, projectID string, targets []ProjectCodegenTarget, validator CodegenTargetValidator) error {
	if d == nil {
		return ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	normalizedTargets, err := normalizeCodegenTargetsForMutation(ctx, targets, validator)
	if err != nil {
		return err
	}
	if err := validateSupportedPythonCodegenMutation(project.CodegenTargets, normalizedTargets); err != nil {
		return err
	}

	project.CodegenTargets = cloneProjectCodegenTargets(normalizedTargets)
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetProjectCodegenTargets(ctx context.Context, projectID string, targets []ProjectCodegenTarget, validator CodegenTargetValidator) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetProjectCodegenTargets(ctx, projectID, targets, validator); err != nil {
			return document, err
		}
		return document, nil
	})
}

func normalizeCodegenTargetsForMutation(ctx context.Context, targets []ProjectCodegenTarget, validator CodegenTargetValidator) ([]ProjectCodegenTarget, error) {
	normalizedTargets := make([]ProjectCodegenTarget, 0, len(targets))
	seenLanguages := make(map[string]struct{}, len(targets))
	for _, target := range targets {
		normalized, err := target.Normalized()
		if err != nil {
			return nil, err
		}
		if _, ok := seenLanguages[normalized.Language]; ok {
			return nil, fmt.Errorf("%w: %s", ErrProjectCodegenTargetDuplicateLanguage, normalized.Language)
		}
		seenLanguages[normalized.Language] = struct{}{}
		normalizedTargets = append(normalizedTargets, normalized)
	}

	for _, normalized := range normalizedTargets {
		if normalized.Language != string(CodeLanguagePython) {
			if validator == nil {
				return nil, fmt.Errorf("%w: %s", ErrProjectCodegenTargetValidatorRequired, normalized.Language)
			}
			if err := validator.ValidateProjectCodegenTarget(ctx, normalized); err != nil {
				return nil, err
			}
		}
	}
	return normalizedTargets, nil
}

func validateSupportedPythonCodegenMutation(previous []ProjectCodegenTarget, next []ProjectCodegenTarget) error {
	previousPython, previousHasPython := pythonCodegenTarget(previous)
	nextPython, nextHasPython := pythonCodegenTarget(next)
	if !previousHasPython && !nextHasPython {
		return nil
	}
	if previousHasPython && nextHasPython {
		equal, err := projectCodegenTargetsEqual(previousPython, nextPython)
		if err != nil {
			return err
		}
		if equal {
			return nil
		}
	}
	return ErrProjectCodegenPythonMutationUnsupported
}

func pythonCodegenTarget(targets []ProjectCodegenTarget) (ProjectCodegenTarget, bool) {
	for _, target := range targets {
		if strings.TrimSpace(target.Language) != string(CodeLanguagePython) {
			continue
		}
		return target.Clone(), true
	}
	return ProjectCodegenTarget{}, false
}

func cloneProjectCodegenTargets(targets []ProjectCodegenTarget) []ProjectCodegenTarget {
	if len(targets) == 0 {
		return nil
	}

	cloned := make([]ProjectCodegenTarget, len(targets))
	for index, target := range targets {
		cloned[index] = target.Clone()
	}
	return cloned
}

func projectCodegenTargetsEqual(left ProjectCodegenTarget, right ProjectCodegenTarget) (bool, error) {
	if left.Language != right.Language {
		return false, nil
	}

	leftPayload, err := compactRawJSON(left.Payload)
	if err != nil {
		return false, fmt.Errorf("compact project codegen target %q payload: %w", left.Language, err)
	}
	rightPayload, err := compactRawJSON(right.Payload)
	if err != nil {
		return false, fmt.Errorf("compact project codegen target %q payload: %w", right.Language, err)
	}
	return bytes.Equal(leftPayload, rightPayload), nil
}

func compactRawJSON(raw RawJSON) (RawJSON, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, nil
	}

	var compacted bytes.Buffer
	if err := json.Compact(&compacted, trimmed); err != nil {
		return nil, err
	}
	return cloneRawJSON(compacted.Bytes()), nil
}
