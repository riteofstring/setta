package orchestrator

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"setta/internal/jsonio"
	"setta/internal/workspace"
)

const (
	workflowDefinitionDirName = ".setta/workflows"
	workflowDefinitionExt     = ".json"
)

type workflowDefinitionFile struct {
	SchemaVersion int           `json:"schemaVersion"`
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Description   string        `json:"description"`
	Graph         WorkflowGraph `json:"graph"`
}

func (service *Service) listWorkspaceDefinitions(workspaceSummary workspace.WorkspaceSummary) ([]WorkflowDefinition, error) {
	dir := workflowDefinitionsDir(workspaceSummary.RootPath)
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []WorkflowDefinition{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("list workflow definition files %s: %w", dir, err)
	}
	definitions := []WorkflowDefinition{}
	seen := map[string]string{}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != workflowDefinitionExt {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		definition, err := readWorkflowDefinitionFile(workspaceSummary.ID, path)
		if err != nil {
			return nil, err
		}
		if previous, ok := seen[definition.ID]; ok {
			return nil, fmt.Errorf("workflow definition id %s appears in both %s and %s", definition.ID, previous, path)
		}
		seen[definition.ID] = path
		definitions = append(definitions, definition)
	}
	sort.Slice(definitions, func(i int, j int) bool {
		if definitions[i].Name != definitions[j].Name {
			return definitions[i].Name < definitions[j].Name
		}
		return definitions[i].ID < definitions[j].ID
	})
	return definitions, nil
}

func (service *Service) loadWorkspaceDefinition(workspaceSummary workspace.WorkspaceSummary, definitionID string) (WorkflowDefinition, string, error) {
	if err := validateStorageID("definition id", definitionID); err != nil {
		return WorkflowDefinition{}, "", err
	}
	dir := workflowDefinitionsDir(workspaceSummary.RootPath)
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return WorkflowDefinition{}, "", fmt.Errorf("workflow definition %s was not found", definitionID)
	}
	if err != nil {
		return WorkflowDefinition{}, "", fmt.Errorf("list workflow definition files %s: %w", dir, err)
	}
	var matched WorkflowDefinition
	matchedPath := ""
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != workflowDefinitionExt {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		definition, err := readWorkflowDefinitionFile(workspaceSummary.ID, path)
		if err != nil {
			return WorkflowDefinition{}, "", err
		}
		if definition.ID != definitionID {
			continue
		}
		if matchedPath != "" {
			return WorkflowDefinition{}, "", fmt.Errorf("workflow definition id %s appears in both %s and %s", definitionID, matchedPath, path)
		}
		matched = definition
		matchedPath = path
	}
	if matchedPath == "" {
		return WorkflowDefinition{}, "", fmt.Errorf("workflow definition %s was not found", definitionID)
	}
	return matched, matchedPath, nil
}

func readWorkflowDefinitionFile(workspaceID string, path string) (WorkflowDefinition, error) {
	file, err := os.Open(path)
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("read workflow definition file %s: %w", path, err)
	}
	defer file.Close()
	var saved workflowDefinitionFile
	if err := jsonio.DecodeSingle(file, &saved); err != nil {
		return WorkflowDefinition{}, fmt.Errorf("decode workflow definition file %s: %w", path, err)
	}
	info, err := file.Stat()
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("stat workflow definition file %s: %w", path, err)
	}
	definition := workflowDefinitionFromFile(workspaceID, saved, timestamp(info.ModTime()))
	if err := validateDefinitionSnapshot(definition); err != nil {
		return WorkflowDefinition{}, fmt.Errorf("validate workflow definition file %s: %w", path, err)
	}
	return definition, nil
}

func workflowDefinitionFromFile(workspaceID string, saved workflowDefinitionFile, updatedAt string) WorkflowDefinition {
	return WorkflowDefinition{
		SchemaVersion: saved.SchemaVersion,
		ID:            saved.ID,
		WorkspaceID:   workspaceID,
		Name:          saved.Name,
		Description:   saved.Description,
		Graph:         normalizeWorkflowGraph(saved.Graph),
		CreatedAt:     updatedAt,
		UpdatedAt:     updatedAt,
	}
}

func workflowDefinitionToFile(definition WorkflowDefinition) workflowDefinitionFile {
	return workflowDefinitionFile{
		SchemaVersion: definition.SchemaVersion,
		ID:            definition.ID,
		Name:          definition.Name,
		Description:   definition.Description,
		Graph:         normalizeWorkflowGraph(definition.Graph),
	}
}

func writeWorkflowDefinitionFile(workspaceRoot string, definition WorkflowDefinition, currentPath string) (WorkflowDefinition, error) {
	targetPath, err := workflowDefinitionWriteTarget(workspaceRoot, definition, currentPath)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	payload, err := json.MarshalIndent(workflowDefinitionToFile(definition), "", "  ")
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("encode workflow definition file %s: %w", targetPath, err)
	}
	payload = append(payload, '\n')
	if err := writeWorkflowDefinitionPayload(targetPath, payload); err != nil {
		return WorkflowDefinition{}, err
	}
	return workflowDefinitionWithFileTimestamps(definition, targetPath)
}

func workflowDefinitionWriteTarget(workspaceRoot string, definition WorkflowDefinition, currentPath string) (string, error) {
	if err := validateDefinitionSnapshot(definition); err != nil {
		return "", err
	}
	dir := workflowDefinitionsDir(workspaceRoot)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create workflow definition directory %s: %w", dir, err)
	}
	if currentPath != "" {
		return currentPath, nil
	}
	targetPath := workflowDefinitionPath(workspaceRoot, definition.Name, definition.ID)
	if err := ensureWorkflowDefinitionWriteTargetAvailable(targetPath, currentPath); err != nil {
		return "", err
	}
	return targetPath, nil
}

func ensureWorkflowDefinitionWriteTargetAvailable(targetPath string, currentPath string) error {
	if currentPath == "" || currentPath == targetPath {
		return nil
	}
	if _, err := os.Stat(targetPath); err == nil {
		return fmt.Errorf("workflow definition file already exists: %s", targetPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat workflow definition file %s: %w", targetPath, err)
	}
	return nil
}

func writeWorkflowDefinitionPayload(targetPath string, payload []byte) error {
	dir := filepath.Dir(targetPath)
	tempFile, err := createWorkflowDefinitionTempFile(dir, "."+filepath.Base(targetPath)+".*.tmp")
	if err != nil {
		return fmt.Errorf("create workflow definition temp file %s: %w", dir, err)
	}
	tempPath := tempFile.Name()
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(tempPath)
		}
	}()
	if _, err := tempFile.Write(payload); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("write workflow definition temp file %s: %w", tempPath, err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close workflow definition temp file %s: %w", tempPath, err)
	}
	if err := renameWorkflowDefinitionFile(tempPath, targetPath); err != nil {
		return fmt.Errorf("commit workflow definition file %s: %w", targetPath, err)
	}
	committed = true
	return nil
}

func workflowDefinitionWithFileTimestamps(definition WorkflowDefinition, targetPath string) (WorkflowDefinition, error) {
	info, err := os.Stat(targetPath)
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("stat workflow definition file %s: %w", targetPath, err)
	}
	definition.CreatedAt = timestamp(info.ModTime())
	definition.UpdatedAt = timestamp(info.ModTime())
	return definition, nil
}

var (
	createWorkflowDefinitionTempFile = os.CreateTemp
	renameWorkflowDefinitionFile     = os.Rename
)

func deleteWorkflowDefinitionFile(path string) error {
	if err := os.Remove(path); err != nil {
		return fmt.Errorf("delete workflow definition file %s: %w", path, err)
	}
	return nil
}

func workflowDefinitionsDir(workspaceRoot string) string {
	return filepath.Join(workspaceRoot, filepath.FromSlash(workflowDefinitionDirName))
}

func workflowDefinitionPath(workspaceRoot string, name string, id string) string {
	return filepath.Join(workflowDefinitionsDir(workspaceRoot), workflowDefinitionFileName(name, id))
}

func workflowDefinitionFileName(name string, id string) string {
	return workflowDefinitionSlug(name) + "--" + id + workflowDefinitionExt
}

func workflowDefinitionSlug(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	lastHyphen := false
	for _, char := range normalized {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
			lastHyphen = false
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
			lastHyphen = false
		default:
			if !lastHyphen && builder.Len() > 0 {
				builder.WriteByte('-')
				lastHyphen = true
			}
		}
	}
	slug := strings.Trim(builder.String(), "-")
	if slug == "" {
		return "workflow"
	}
	return slug
}

func workflowDefinitionVersionFromDefinition(definition WorkflowDefinition, versionID string, versionNumber int, createdAt time.Time) WorkflowDefinitionVersion {
	return WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            versionID,
		WorkspaceID:   definition.WorkspaceID,
		DefinitionID:  definition.ID,
		VersionNumber: versionNumber,
		Name:          definition.Name,
		Description:   definition.Description,
		Graph:         normalizeWorkflowGraph(definition.Graph),
		CreatedAt:     timestamp(createdAt),
	}
}
