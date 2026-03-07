package projectstate

import "context"

func (d *Document) SetGenCodePrefix(projectID string, genCodePrefix string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		return err
	}
	if !ok {
		return ErrProjectCodegenPythonTargetMissing
	}

	config.GenCodePrefix = genCodePrefix
	if err := project.SetPythonCodegenTarget(config); err != nil {
		return err
	}
	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		return err
	}

	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetGenCodePrefix(ctx context.Context, projectID string, genCodePrefix string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetGenCodePrefix(projectID, genCodePrefix); err != nil {
			return document, err
		}
		return document, nil
	})
}
