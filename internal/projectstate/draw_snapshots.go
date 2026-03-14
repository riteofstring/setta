package projectstate

import (
	"fmt"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const DrawSnapshotFolderName = "draw_snapshots"

func BuildDrawSnapshotPath(sectionID string, artifactsRoot string) (string, error) {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return "", ErrSectionIDRequired
	}

	resolvedArtifactsRoot, err := statefs.NormalizePath(artifactsRoot, "")
	if err != nil {
		return "", fmt.Errorf("resolve artifacts root: %w", err)
	}
	return filepath.Join(resolvedArtifactsRoot, DrawSnapshotFolderName, trimmedSectionID+".png"), nil
}

func (d *Document) SetDrawSectionRenderedImagePaths(projectID string, renderedPathsBySectionID map[string]string) error {
	if d == nil {
		return fmt.Errorf("document is required")
	}
	if len(renderedPathsBySectionID) == 0 {
		return nil
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	for sectionID, renderedImagePath := range renderedPathsBySectionID {
		trimmedSectionID := strings.TrimSpace(sectionID)
		if trimmedSectionID == "" {
			return ErrSectionIDRequired
		}
		normalizedRenderedImagePath, err := statefs.NormalizePath(renderedImagePath, "")
		if err != nil {
			return fmt.Errorf("%w: %q", ErrDrawRenderedImagePathRequired, renderedImagePath)
		}

		_, _, impl, err := project.ResolveSection(trimmedSectionID)
		if err != nil {
			return err
		}
		if !impl.IsDraw() {
			return fmt.Errorf("%w: %q", ErrDrawSectionRequired, trimmedSectionID)
		}

		updatedImpl := impl.Clone()
		updatedImpl.Draw.RenderedImagePath = normalizedRenderedImagePath
		project.SectionImpls[updatedImpl.ID] = updatedImpl
	}

	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetDrawSectionRenderedImagePaths(projectID string, renderedPathsBySectionID map[string]string) (Snapshot, error) {
	return r.Mutate(func(document Document) (Document, error) {
		nextDocument := document.Clone()
		if err := nextDocument.SetDrawSectionRenderedImagePaths(projectID, renderedPathsBySectionID); err != nil {
			return nextDocument, err
		}
		return nextDocument, nil
	})
}
