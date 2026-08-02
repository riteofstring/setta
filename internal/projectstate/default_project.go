package projectstate

import (
	"context"
	"strings"
)

func (d *Document) SetDefaultProjectID(projectID string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return ErrProjectIDRequired
	}
	if _, err := d.ProjectByID(trimmedProjectID); err != nil {
		return err
	}

	d.DefaultProjectID = trimmedProjectID
	return nil
}

func (r *Runtime) SetDefaultProjectID(ctx context.Context, projectID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetDefaultProjectID(projectID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}
