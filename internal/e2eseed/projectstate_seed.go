package e2eseed

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/projectstate"
)

const (
	DefaultSampleProjectID   = "sample-project-config"
	DefaultSampleProjectName = "sample_project"
)

var ErrSettaFilesRootRequired = errors.New("setta files root is required")

type ProjectStateSeedOptions struct {
	SettaFilesRoot string
	ProjectID      string
	ProjectName    string
}

func SeedProjectState(ctx context.Context, options ProjectStateSeedOptions) error {
	root := strings.TrimSpace(options.SettaFilesRoot)
	if root == "" {
		return ErrSettaFilesRootRequired
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create setta files root: %w", err)
	}

	projectID := strings.TrimSpace(options.ProjectID)
	if projectID == "" {
		projectID = DefaultSampleProjectID
	}
	projectName := strings.TrimSpace(options.ProjectName)
	if projectName == "" {
		projectName = DefaultSampleProjectName
	}

	windowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                      projectID,
		Name:                    projectName,
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &windowing,
	}
	if _, err := project.CreateViewMode(); err != nil {
		return fmt.Errorf("seed project view mode: %w", err)
	}

	mainDocument := projectstate.NewDocument()
	mainDocument.DefaultProjectID = projectID
	mainDocument.Projects[projectID] = project

	if err := saveDocument(ctx, filepath.Join(root, projectstate.MainFileName), mainDocument); err != nil {
		return fmt.Errorf("seed main project state: %w", err)
	}
	if err := saveDocument(ctx, filepath.Join(root, projectstate.SettingsFileName), projectstate.NewDocument()); err != nil {
		return fmt.Errorf("seed settings project state: %w", err)
	}
	return nil
}

func saveDocument(ctx context.Context, path string, document projectstate.Document) error {
	store, err := projectstate.NewStore(path, projectstate.StoreOptions{})
	if err != nil {
		return err
	}
	return store.Save(ctx, document)
}
