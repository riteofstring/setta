package orchestrator

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServiceWorkflowDefinitionRenameKeepsSingleStableFile(t *testing.T) {
	_, resolver, service, workspaceID := newTestWorkflowService(t)
	workspaceRoot := resolver.workspaces[workspaceID].RootPath

	definition, err := service.CreateDefinition(workspaceID, "Review", "first", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	originalPath := assertSingleWorkflowDefinitionFile(t, workspaceRoot, workspaceID, definition.ID)

	for _, name := range []string{"Review v2", "Review v3", "Final Review"} {
		if _, err := service.UpdateDefinition(workspaceID, definition.ID, name, "renamed", startEndGraph()); err != nil {
			t.Fatalf("rename definition to %q: %v", name, err)
		}
		if got := assertSingleWorkflowDefinitionFile(t, workspaceRoot, workspaceID, definition.ID); got != originalPath {
			t.Fatalf("definition path after rename %q = %s, want stable %s", name, got, originalPath)
		}
	}

	listed, err := service.ListDefinitions(workspaceID)
	if err != nil {
		t.Fatalf("list definitions after rename: %v", err)
	}
	if len(listed) != 1 || listed[0].ID != definition.ID || listed[0].Name != "Final Review" {
		t.Fatalf("definitions after repeated rename = %+v, want one renamed definition", listed)
	}
	saved, err := readWorkflowDefinitionFile(workspaceID, originalPath)
	if err != nil {
		t.Fatalf("read stable definition file: %v", err)
	}
	if saved.Name != "Final Review" {
		t.Fatalf("saved definition name = %q, want Final Review", saved.Name)
	}
}

func TestServiceWorkflowDefinitionUpdateCommitFailureLeavesOriginalReadable(t *testing.T) {
	_, resolver, service, workspaceID := newTestWorkflowService(t)
	workspaceRoot := resolver.workspaces[workspaceID].RootPath

	definition, err := service.CreateDefinition(workspaceID, "Stable", "original", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	definitionPath := assertSingleWorkflowDefinitionFile(t, workspaceRoot, workspaceID, definition.ID)
	originalRaw, err := os.ReadFile(definitionPath)
	if err != nil {
		t.Fatalf("read original definition file: %v", err)
	}

	previousRename := renameWorkflowDefinitionFile
	renameWorkflowDefinitionFile = func(string, string) error {
		return errors.New("injected workflow definition rename failure")
	}
	t.Cleanup(func() {
		renameWorkflowDefinitionFile = previousRename
	})

	_, err = service.UpdateDefinition(workspaceID, definition.ID, "Failed Rename", "changed", startEndGraph())
	if err == nil {
		t.Fatal("update definition succeeded, want injected commit failure")
	}
	if !strings.Contains(err.Error(), "injected workflow definition rename failure") {
		t.Fatalf("update error = %v, want injected rename failure", err)
	}

	afterRaw, err := os.ReadFile(definitionPath)
	if err != nil {
		t.Fatalf("read definition after failed update: %v", err)
	}
	if string(afterRaw) != string(originalRaw) {
		t.Fatalf("definition changed after failed update:\nafter=%s\noriginal=%s", afterRaw, originalRaw)
	}
	loaded, err := service.ReadDefinition(workspaceID, definition.ID)
	if err != nil {
		t.Fatalf("read definition after failed update: %v", err)
	}
	if loaded.Name != definition.Name || loaded.Description != definition.Description {
		t.Fatalf("loaded definition after failed update = %+v, want original %+v", loaded, definition)
	}
	assertSingleWorkflowDefinitionFile(t, workspaceRoot, workspaceID, definition.ID)
}

func TestServiceWorkflowDefinitionDuplicateIDFailsLoudly(t *testing.T) {
	_, resolver, service, workspaceID := newTestWorkflowService(t)
	workspaceRoot := resolver.workspaces[workspaceID].RootPath

	definition, err := service.CreateDefinition(workspaceID, "Duplicate", "", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	originalPath := assertSingleWorkflowDefinitionFile(t, workspaceRoot, workspaceID, definition.ID)
	raw, err := os.ReadFile(originalPath)
	if err != nil {
		t.Fatalf("read original definition file: %v", err)
	}
	duplicatePath := filepath.Join(workflowDefinitionsDir(workspaceRoot), "manual-duplicate--"+definition.ID+workflowDefinitionExt)
	if err := os.WriteFile(duplicatePath, raw, 0o644); err != nil {
		t.Fatalf("write duplicate definition file: %v", err)
	}

	_, err = service.ListDefinitions(workspaceID)
	assertDuplicateWorkflowDefinitionError(t, err, definition.ID, originalPath, duplicatePath)
	_, err = service.ReadDefinition(workspaceID, definition.ID)
	assertDuplicateWorkflowDefinitionError(t, err, definition.ID, originalPath, duplicatePath)
}

func updateWorkflowDefinitionAndAssertStableFile(t *testing.T, service *Service, workspaceID string, workspaceRoot string, definition WorkflowDefinition, name string, description string) WorkflowDefinition {
	t.Helper()
	definitionPath := workflowDefinitionPath(workspaceRoot, definition.Name, definition.ID)
	updated, err := service.UpdateDefinition(workspaceID, definition.ID, name, description, startEndGraph())
	if err != nil {
		t.Fatalf("update definition: %v", err)
	}
	if _, err := os.Stat(definitionPath); err != nil {
		t.Fatalf("stable definition path missing after rename: %v", err)
	}
	updatedPath := workflowDefinitionPath(workspaceRoot, updated.Name, updated.ID)
	if _, err := os.Stat(updatedPath); !os.IsNotExist(err) {
		t.Fatalf("rename created display-name path or stat failed unexpectedly: %v", err)
	}
	updatedRaw, err := os.ReadFile(definitionPath)
	if err != nil {
		t.Fatalf("read renamed definition file: %v", err)
	}
	if !strings.Contains(string(updatedRaw), `"name": "`+name+`"`) {
		t.Fatalf("renamed definition file did not update JSON name: %s", updatedRaw)
	}
	return updated
}

func assertSingleWorkflowDefinitionFile(t *testing.T, workspaceRoot string, workspaceID string, definitionID string) string {
	t.Helper()
	paths := workflowDefinitionFilePathsForID(t, workspaceRoot, workspaceID, definitionID)
	if len(paths) != 1 {
		t.Fatalf("workflow definition %s file paths = %v, want one", definitionID, paths)
	}
	return paths[0]
}

func workflowDefinitionFilePathsForID(t *testing.T, workspaceRoot string, workspaceID string, definitionID string) []string {
	t.Helper()
	dir := workflowDefinitionsDir(workspaceRoot)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("list workflow definition files: %v", err)
	}
	paths := []string{}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != workflowDefinitionExt {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		definition, err := readWorkflowDefinitionFile(workspaceID, path)
		if err != nil {
			t.Fatalf("read workflow definition file %s: %v", path, err)
		}
		if definition.ID == definitionID {
			paths = append(paths, path)
		}
	}
	return paths
}

func assertDuplicateWorkflowDefinitionError(t *testing.T, err error, definitionID string, firstPath string, secondPath string) {
	t.Helper()
	if err == nil {
		t.Fatal("workflow definition read succeeded, want duplicate id error")
	}
	message := err.Error()
	for _, expected := range []string{"workflow definition id " + definitionID + " appears in both", firstPath, secondPath} {
		if !strings.Contains(message, expected) {
			t.Fatalf("duplicate error = %v, want %q", err, expected)
		}
	}
}
