package deployments

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/projectstate"
)

func TestDefaultCatalogRootUsesSettaFilesDeploymentsChild(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	got, err := DefaultCatalogRoot(root)
	if err != nil {
		t.Fatalf("default catalog root: %v", err)
	}

	want := filepath.Join(root, "deployments")
	if got != want {
		t.Fatalf("expected catalog root %q, got %q", want, got)
	}
}

func TestNormalizeDeploymentNameRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		input   string
		want    string
		wantErr error
	}{
		{
			name:    "blank",
			input:   "   ",
			wantErr: ErrDeploymentNameRequired,
		},
		{
			name:    "reserved dot",
			input:   ".",
			wantErr: ErrDeploymentNameReserved,
		},
		{
			name:    "reserved dot dot",
			input:   "..",
			wantErr: ErrDeploymentNameReserved,
		},
		{
			name:    "slash path",
			input:   "nested/path",
			wantErr: ErrDeploymentNameSingleSegment,
		},
		{
			name:    "backslash path",
			input:   `nested\path`,
			wantErr: ErrDeploymentNameSingleSegment,
		},
		{
			name:  "trimmed valid",
			input: "  demo-share  ",
			want:  "demo-share",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			got, err := NormalizeDeploymentName(testCase.input)
			if !errors.Is(err, testCase.wantErr) {
				t.Fatalf("expected error %v, got %v", testCase.wantErr, err)
			}
			if got != testCase.want {
				t.Fatalf("expected normalized name %q, got %q", testCase.want, got)
			}
		})
	}
}

func TestCatalogAllocateCreatesNextVersionDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	catalog, err := NewCatalog(CatalogOptions{Root: root})
	if err != nil {
		t.Fatalf("new catalog: %v", err)
	}

	deploymentParent := filepath.Join(root, "demo-share")
	if err := os.MkdirAll(filepath.Join(deploymentParent, "v1"), 0o755); err != nil {
		t.Fatalf("mkdir v1: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(deploymentParent, "v3"), 0o755); err != nil {
		t.Fatalf("mkdir v3: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(deploymentParent, "not-a-version"), 0o755); err != nil {
		t.Fatalf("mkdir junk dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(deploymentParent, "v2.txt"), []byte("junk\n"), 0o644); err != nil {
		t.Fatalf("write junk file: %v", err)
	}

	allocation, err := catalog.Allocate(" demo-share ")
	if err != nil {
		t.Fatalf("allocate deployment root: %v", err)
	}

	if allocation.DeploymentName != "demo-share" {
		t.Fatalf("expected deployment name demo-share, got %q", allocation.DeploymentName)
	}
	if allocation.DeploymentVersion != "v4" {
		t.Fatalf("expected deployment version v4, got %q", allocation.DeploymentVersion)
	}
	if filepath.Base(allocation.DeploymentRoot) != "v4" {
		t.Fatalf("expected allocated root to end with v4, got %q", allocation.DeploymentRoot)
	}
	if info, err := os.Stat(allocation.DeploymentRoot); err != nil {
		t.Fatalf("stat allocated root: %v", err)
	} else if !info.IsDir() {
		t.Fatalf("expected allocated root %q to be a directory", allocation.DeploymentRoot)
	}
}

func TestCatalogListReturnsNewestFirstByCreatedAt(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	catalog, err := NewCatalog(CatalogOptions{Root: root})
	if err != nil {
		t.Fatalf("new catalog: %v", err)
	}

	writeCatalogDeployment(t, root, "alpha-share", "v1", TypeShare, "project-alpha", "Alpha", time.Date(2026, 3, 7, 10, 0, 0, 0, time.UTC))
	writeCatalogDeployment(t, root, "zeta-share", "v1", TypeShare, "project-zeta", "Zeta", time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC))
	writeCatalogDeployment(t, root, "demo-app", "v1", TypeApp, "project-app", "App", time.Date(2026, 3, 9, 11, 0, 0, 0, time.UTC))
	writeCatalogInvalidManifest(t, filepath.Join(root, "invalid-share", "v1"), map[string]any{
		"version":           1,
		"deploymentName":    "invalid-share",
		"deploymentType":    "share",
		"deploymentVersion": "v1",
		"createdAt":         time.Date(2026, 3, 10, 11, 0, 0, 0, time.UTC).Format(time.RFC3339Nano),
	})

	entries, err := catalog.List(context.Background(), TypeShare)
	if err != nil {
		t.Fatalf("list deployments: %v", err)
	}

	if len(entries) != 2 {
		t.Fatalf("expected 2 share deployments, got %d", len(entries))
	}
	if entries[0].DeploymentName != "zeta-share" || entries[0].DefaultProjectName != "Zeta" {
		t.Fatalf("expected newest entry to be zeta-share/Zeta, got %#v", entries[0])
	}
	if entries[1].DeploymentName != "alpha-share" || entries[1].DefaultProjectName != "Alpha" {
		t.Fatalf("expected older entry to be alpha-share/Alpha, got %#v", entries[1])
	}
}

func TestCatalogListVersionsReturnsNewestFirstAndFiltersInvalidEntries(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	catalog, err := NewCatalog(CatalogOptions{Root: root})
	if err != nil {
		t.Fatalf("new catalog: %v", err)
	}

	writeCatalogDeployment(t, root, "demo-share", "v1", TypeShare, "project-alpha", "Alpha", time.Date(2026, 3, 6, 9, 0, 0, 0, time.UTC))
	writeCatalogDeployment(t, root, "demo-share", "v3", TypeShare, "project-alpha", "Alpha", time.Date(2026, 3, 8, 9, 0, 0, 0, time.UTC))
	writeCatalogDeployment(t, root, "demo-share", "v2", TypeApp, "project-alpha", "Alpha", time.Date(2026, 3, 7, 9, 0, 0, 0, time.UTC))
	writeCatalogDeploymentWithDocument(t, filepath.Join(root, "demo-share", "v4"), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-beta",
		Projects: map[string]projectstate.Project{
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}, map[string]any{
		"version":                1,
		"deploymentName":         "wrong-name",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-beta",
		"deploymentVersion":      "v4",
		"createdAt":              time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC).Format(time.RFC3339Nano),
	})
	writeCatalogInvalidManifest(t, filepath.Join(root, "demo-share", "v5"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"createdAt":              time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC).Format(time.RFC3339Nano),
	})

	entries, err := catalog.ListVersions(context.Background(), "demo-share", TypeShare)
	if err != nil {
		t.Fatalf("list deployment versions: %v", err)
	}

	if len(entries) != 2 {
		t.Fatalf("expected 2 valid share versions, got %d", len(entries))
	}
	if entries[0].DeploymentVersion != "v3" {
		t.Fatalf("expected newest valid version v3, got %q", entries[0].DeploymentVersion)
	}
	if entries[1].DeploymentVersion != "v1" {
		t.Fatalf("expected older valid version v1, got %q", entries[1].DeploymentVersion)
	}
}

func TestCatalogLatestUsesHighestVersionRootAsSourceOfTruth(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	catalog, err := NewCatalog(CatalogOptions{Root: root})
	if err != nil {
		t.Fatalf("new catalog: %v", err)
	}

	writeCatalogDeployment(t, root, "demo-share", "v1", TypeShare, "project-alpha", "Alpha", time.Date(2026, 3, 6, 9, 0, 0, 0, time.UTC))
	writeCatalogDeployment(t, root, "demo-share", "v2", TypeApp, "project-alpha", "Alpha", time.Date(2026, 3, 7, 9, 0, 0, 0, time.UTC))

	_, err = catalog.Latest(context.Background(), "demo-share", TypeShare)
	if !errors.Is(err, ErrDeploymentNotFound) {
		t.Fatalf("expected latest lookup to fail with not found, got %v", err)
	}
}

func TestCatalogListVersionsReturnsEmptyWhenDeploymentMissing(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	catalog, err := NewCatalog(CatalogOptions{Root: root})
	if err != nil {
		t.Fatalf("new catalog: %v", err)
	}

	entries, err := catalog.ListVersions(context.Background(), "missing", TypeShare)
	if err != nil {
		t.Fatalf("list missing deployment versions: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no versions for missing deployment, got %#v", entries)
	}
}

func TestCatalogLatestReturnsNotFoundWhenDeploymentDirectoryMissing(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	catalog, err := NewCatalog(CatalogOptions{Root: root})
	if err != nil {
		t.Fatalf("new catalog: %v", err)
	}

	_, err = catalog.Latest(context.Background(), "missing", TypeShare)
	if !errors.Is(err, ErrDeploymentNotFound) {
		t.Fatalf("expected latest lookup for missing deployment to fail with not found, got %v", err)
	}
}

func writeCatalogDeployment(t *testing.T, catalogRoot string, deploymentName string, deploymentVersion string, deploymentType Type, defaultProjectID string, defaultProjectName string, createdAt time.Time) {
	t.Helper()

	writeCatalogDeploymentWithDocument(
		t,
		filepath.Join(catalogRoot, deploymentName, deploymentVersion),
		singleProjectDocument(defaultProjectID, defaultProjectName),
		map[string]any{
			"version":                1,
			"deploymentName":         deploymentName,
			"deploymentType":         string(deploymentType),
			"defaultProjectConfigId": defaultProjectID,
			"deploymentVersion":      deploymentVersion,
			"createdAt":              createdAt.Format(time.RFC3339Nano),
		},
	)
}

func writeCatalogDeploymentWithDocument(t *testing.T, deploymentRoot string, document projectstate.Document, manifest map[string]any) {
	t.Helper()

	writeDeploymentFixture(t, deploymentRoot, document, manifest, map[string]any{
		"allowRun": true,
	})
}

func writeCatalogInvalidManifest(t *testing.T, deploymentRoot string, manifest map[string]any) {
	t.Helper()

	writeDeploymentJSON(t, filepath.Join(deploymentRoot, "manifest.json"), manifest)
}
