package projectshell

import (
	"context"
	"errors"
	"testing"

	"setta/internal/projectstate"
)

func TestServiceLoadAllProjectMetadataReturnsDefaultAndSortedMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-b",
		Projects: map[string]projectstate.Project{
			"project-b": {
				ID:   "project-b",
				Name: "beta",
			},
			"project-a": {
				ID:   "project-a",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	metadata, err := service.LoadAllProjectMetadata(context.Background())
	if err != nil {
		t.Fatalf("load all project metadata: %v", err)
	}
	if metadata.DefaultProjectConfigID == nil || *metadata.DefaultProjectConfigID != "project-b" {
		t.Fatalf("expected default project-b, got %#v", metadata.DefaultProjectConfigID)
	}
	if len(metadata.ProjectMetadata) != 2 {
		t.Fatalf("expected two metadata entries, got %#v", metadata.ProjectMetadata)
	}
	if metadata.ProjectMetadata[0].ID != "project-a" || metadata.ProjectMetadata[1].ID != "project-b" {
		t.Fatalf("unexpected metadata order %#v", metadata.ProjectMetadata)
	}
}

func TestServiceLoadProjectConfigLoadsByName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	projectConfig, err := service.LoadProjectConfig(context.Background(), "Alpha")
	if err != nil {
		t.Fatalf("load project config: %v", err)
	}
	if projectConfig.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", projectConfig.ProjectConfig.ID)
	}
	if projectConfig.ProjectConfig.Name != "Alpha" {
		t.Fatalf("expected Alpha, got %q", projectConfig.ProjectConfig.Name)
	}
}

func TestServiceLoadProjectConfigReturnsProjectNotFound(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.LoadProjectConfig(context.Background(), "Missing")
	if err == nil {
		t.Fatal("expected missing project error")
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}

func TestServiceLoadProjectConfigRejectsAmbiguousName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Shared",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Shared",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.LoadProjectConfig(context.Background(), "Shared")
	if err == nil {
		t.Fatal("expected ambiguous project name error")
	}
	if !errors.Is(err, projectstate.ErrProjectNameAmbiguous) {
		t.Fatalf("expected ErrProjectNameAmbiguous, got %v", err)
	}
}
