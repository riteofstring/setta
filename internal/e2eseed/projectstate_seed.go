package e2eseed

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
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

	CanvasFlowPerfNodeCounts []int
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

	project, err := newSeedProject(projectID, projectName)
	if err != nil {
		return err
	}

	mainDocument := projectstate.NewDocument()
	mainDocument.DefaultProjectID = projectID
	mainDocument.Projects[projectID] = project
	for _, count := range normalizeCanvasFlowPerfNodeCounts(options.CanvasFlowPerfNodeCounts) {
		perfProject, err := newCanvasFlowPerfProject(count)
		if err != nil {
			return err
		}
		mainDocument.Projects[perfProject.ID] = perfProject
	}

	if err := saveDocument(ctx, filepath.Join(root, projectstate.MainFileName), mainDocument); err != nil {
		return fmt.Errorf("seed main project state: %w", err)
	}
	if err := saveDocument(ctx, filepath.Join(root, projectstate.SettingsFileName), projectstate.NewDocument()); err != nil {
		return fmt.Errorf("seed settings project state: %w", err)
	}
	return nil
}

func newSeedProject(projectID string, projectName string) (projectstate.Project, error) {
	windowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                      projectID,
		Name:                    projectName,
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &windowing,
	}
	if _, err := project.CreateViewMode(); err != nil {
		return projectstate.Project{}, fmt.Errorf("seed project view mode: %w", err)
	}
	return project, nil
}

func normalizeCanvasFlowPerfNodeCounts(counts []int) []int {
	seen := map[int]struct{}{}
	normalized := make([]int, 0, len(counts))
	for _, count := range counts {
		if count <= 0 {
			continue
		}
		if _, ok := seen[count]; ok {
			continue
		}
		seen[count] = struct{}{}
		normalized = append(normalized, count)
	}
	sort.Ints(normalized)
	return normalized
}

func CanvasFlowPerfProjectID(count int) string {
	return fmt.Sprintf("canvasflow-perf-%d", count)
}

func CanvasFlowPerfProjectName(count int) string {
	return fmt.Sprintf("canvasflow_perf_%d", count)
}

func newCanvasFlowPerfProject(count int) (projectstate.Project, error) {
	project, err := newSeedProject(
		CanvasFlowPerfProjectID(count),
		CanvasFlowPerfProjectName(count),
	)
	if err != nil {
		return projectstate.Project{}, err
	}

	columns := int(math.Ceil(math.Sqrt(float64(count))))
	if columns <= 0 {
		columns = 1
	}
	settings := projectstate.DefaultStructuralMutationSettings()
	for index := 0; index < count; index++ {
		row := index / columns
		column := index % columns
		if _, err := project.CreateTopLevelSection(
			projectstate.CreateTopLevelSectionInput{
				ImplType: "TextBlock",
				ImplOverrides: map[string]any{
					"size": map[string]any{
						"height": 120.0,
						"width":  260.0,
					},
					"text":            fmt.Sprintf("CanvasFlow performance node %d", index),
					"textDisplayMode": "Render",
					"type":            "TextBlock",
				},
				Position: &projectstate.Position{
					X: float64(column * 340),
					Y: float64(row * 190),
				},
			},
			settings,
		); err != nil {
			return projectstate.Project{}, fmt.Errorf(
				"seed CanvasFlow perf section %d/%d: %w",
				index+1,
				count,
				err,
			)
		}
	}
	return project, nil
}

func saveDocument(ctx context.Context, path string, document projectstate.Document) error {
	store, err := projectstate.NewStore(path, projectstate.StoreOptions{})
	if err != nil {
		return err
	}
	return store.Save(ctx, document)
}
