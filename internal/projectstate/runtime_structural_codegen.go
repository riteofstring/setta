package projectstate

import (
	"context"
	"sort"
	"strings"
)

func (r *Runtime) MutateAndSaveReconcilePythonGeneratedSections(
	ctx context.Context,
	projectIDs []string,
	mutate Mutation,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	normalizedProjectIDs := normalizedProjectMutationIDs(projectIDs)
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		nextDocument, err := mutate(document)
		if err != nil {
			return nextDocument, err
		}
		for _, projectID := range normalizedProjectIDs {
			if err := r.reconcileProjectPythonGeneratedSectionsAfterProjectMutation(ctx, &nextDocument, projectID); err != nil {
				return nextDocument, err
			}
		}
		return nextDocument, nil
	})
}

func normalizedProjectMutationIDs(projectIDs []string) []string {
	if len(projectIDs) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(projectIDs))
	normalized := make([]string, 0, len(projectIDs))
	for _, projectID := range projectIDs {
		trimmedProjectID := strings.TrimSpace(projectID)
		if trimmedProjectID == "" {
			continue
		}
		if _, exists := seen[trimmedProjectID]; exists {
			continue
		}
		seen[trimmedProjectID] = struct{}{}
		normalized = append(normalized, trimmedProjectID)
	}
	sort.Strings(normalized)
	return normalized
}

func (r *Runtime) reconcileProjectPythonGeneratedSectionsAfterProjectMutation(
	ctx context.Context,
	document *Document,
	projectID string,
) error {
	if r == nil || document == nil || r.pythonCodegenSectionReconciler == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if !project.HasPythonCodegenTarget() {
		return nil
	}
	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		return err
	}
	if err := r.pythonCodegenSectionReconciler.ReconcileProjectPythonGeneratedSections(ctx, &project); err != nil {
		return err
	}
	document.Projects[projectID] = project
	return nil
}

func (r *Runtime) reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(
	ctx context.Context,
	document *Document,
	projectID string,
) error {
	return r.reconcileProjectPythonGeneratedSectionsAfterProjectMutation(
		ctx,
		document,
		projectID,
	)
}
