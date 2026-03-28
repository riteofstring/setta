package projectstate

import "context"

func (r *Runtime) reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(
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
