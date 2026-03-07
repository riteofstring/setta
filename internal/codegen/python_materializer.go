package codegen

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const pythonPasswordStoreFileName = "passwords.json"

var (
	ErrPythonCodegenSettaFilesRootRequired = errors.New("codegen: python codegen setta files root is required")
	ErrPythonCodegenRuntimeRootRequired    = errors.New("codegen: python codegen runtime root is required")
	ErrPythonCodegenPasswordStoreInvalid   = errors.New("codegen: python codegen password store is invalid")
)

type PythonMaterializerOptions struct {
	SettaFilesRoot string
	RuntimeRoot    string
}

type PythonMaterializer struct {
	settaFilesRoot string
	runtimeRoot    string
}

func NewPythonMaterializer(options PythonMaterializerOptions) (*PythonMaterializer, error) {
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, ErrPythonCodegenSettaFilesRootRequired
	}
	runtimeRoot, err := statefs.NormalizePath(options.RuntimeRoot, "")
	if err != nil {
		return nil, ErrPythonCodegenRuntimeRootRequired
	}
	return &PythonMaterializer{
		settaFilesRoot: settaFilesRoot,
		runtimeRoot:    runtimeRoot,
	}, nil
}

func (m *PythonMaterializer) MaterializeProject(ctx context.Context, document projectstate.Document, projectID string) error {
	if m == nil {
		return ErrPythonCodegenSettaFilesRootRequired
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}
	return m.materializeProject(project)
}

func (m *PythonMaterializer) MaterializeDocument(ctx context.Context, document projectstate.Document) error {
	if m == nil {
		return ErrPythonCodegenSettaFilesRootRequired
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	projectIDs := make([]string, 0, len(document.Projects))
	expectedCodePaths := map[string]struct{}{}
	expectedMetadataPaths := map[string]struct{}{}
	for projectID, project := range document.Projects {
		projectIDs = append(projectIDs, projectID)
		target, ok, err := project.PythonCodegenTarget()
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		expectedCodePaths[filepath.Join(projectstate.ProjectCodeSectionsRoot(m.settaFilesRoot, project.Name), projectstate.GeneratedPythonCodeFileName)] = struct{}{}
		if target.GenerateMetadata {
			expectedMetadataPaths[filepath.Join(projectstate.ProjectCodeSectionsRoot(m.settaFilesRoot, project.Name), projectstate.GeneratedPythonMetadataFileName)] = struct{}{}
		}
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		if err := ctx.Err(); err != nil {
			return err
		}
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return err
		}
		if err := m.materializeProject(project); err != nil {
			return err
		}
	}

	return pruneStalePythonGeneratedOutputs(m.settaFilesRoot, expectedCodePaths, expectedMetadataPaths)
}

func (m *PythonMaterializer) materializeProject(project projectstate.Project) error {
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		return err
	}

	outputRoot := projectstate.ProjectCodeSectionsRoot(m.settaFilesRoot, project.Name)
	codePath := filepath.Join(outputRoot, projectstate.GeneratedPythonCodeFileName)
	metadataPath := filepath.Join(outputRoot, projectstate.GeneratedPythonMetadataFileName)
	if !ok {
		if err := removePythonGeneratedFile(codePath); err != nil {
			return err
		}
		if err := removePythonGeneratedFile(metadataPath); err != nil {
			return err
		}
		return pruneEmptyProjectCodeRoot(outputRoot)
	}

	exported, exportOK, err := project.PythonCodegenExport()
	if err != nil {
		return err
	}
	if !exportOK {
		return fmt.Errorf("codegen: python export missing for project %s", project.ID)
	}
	passwordSecrets, err := readPasswordSecrets(filepath.Join(m.runtimeRoot, "secrets", pythonPasswordStoreFileName))
	if err != nil {
		return err
	}
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PasswordSecrets: passwordSecrets,
	})
	if err != nil {
		return err
	}

	metaCode := ""
	if target.GenerateMetadata {
		metaRenderer := NewPythonMetadataRenderer(exported, graph)
		metaCode, err = metaRenderer.GenerateCode()
		if err != nil {
			return err
		}
		if err := statefs.AtomicWriteFile(metadataPath, []byte(metaCode), 0o644); err != nil {
			return fmt.Errorf("write generated python metadata: %w", err)
		}
	}

	codeRenderer := NewPythonCodeRenderer(graph, target.GenCodePrefix, target.GenCodeSuffix, PythonCodeRendererOptions{
		ValueMode: PythonValueModePackagedRuntime,
		MetaCode:  metaCode,
	})
	codeRenderer.GenerateCode()
	if err := statefs.AtomicWriteFile(codePath, []byte(codeRenderer.Code), 0o644); err != nil {
		return fmt.Errorf("write generated python code: %w", err)
	}

	if !target.GenerateMetadata {
		if err := removePythonGeneratedFile(metadataPath); err != nil {
			return err
		}
	}
	return nil
}

func readPasswordSecrets(path string) (map[string]string, error) {
	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("read python password store: %w", err)
	}
	if strings.TrimSpace(string(payload)) == "" {
		return map[string]string{}, nil
	}

	var secrets map[string]string
	if err := json.Unmarshal(payload, &secrets); err != nil {
		return nil, fmt.Errorf("%w: decode %s: %v", ErrPythonCodegenPasswordStoreInvalid, path, err)
	}
	if secrets == nil {
		return map[string]string{}, nil
	}
	return secrets, nil
}

func pruneStalePythonGeneratedOutputs(
	settaFilesRoot string,
	expectedCodePaths map[string]struct{},
	expectedMetadataPaths map[string]struct{},
) error {
	sectionsRoot := filepath.Join(settaFilesRoot, "code", "sections")
	projectDirs, err := os.ReadDir(sectionsRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read python codegen sections root: %w", err)
	}

	for _, projectDir := range projectDirs {
		if !projectDir.IsDir() {
			continue
		}
		projectRoot := filepath.Join(sectionsRoot, projectDir.Name())
		codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
		if _, ok := expectedCodePaths[codePath]; !ok {
			if err := removePythonGeneratedFile(codePath); err != nil {
				return err
			}
		}
		metadataPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)
		if _, ok := expectedMetadataPaths[metadataPath]; !ok {
			if err := removePythonGeneratedFile(metadataPath); err != nil {
				return err
			}
		}
		if err := pruneEmptyProjectCodeRoot(projectRoot); err != nil {
			return err
		}
	}
	return nil
}

func removePythonGeneratedFile(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove python generated output %s: %w", path, err)
	}
	return nil
}

func pruneEmptyProjectCodeRoot(path string) error {
	entries, err := os.ReadDir(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read project code root %s: %w", path, err)
	}
	if len(entries) != 0 {
		return nil
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove empty project code root %s: %w", path, err)
	}
	return nil
}
