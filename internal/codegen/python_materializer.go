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

type pythonRenderedProject struct {
	target        projectstate.PythonCodegenTarget
	code          string
	generatedBody string
	metadataCode  string
}

type pythonGeneratedSectionSpec struct {
	sectionID   string
	variantID   string
	implID      string
	name        string
	sectionType string
	kind        projectstate.GeneratedSectionKind
	code        string
	binding     *projectstate.CodeFileBinding
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

func (m *PythonMaterializer) ReconcileProjectPythonGeneratedSections(ctx context.Context, project *projectstate.Project) error {
	if m == nil {
		return ErrPythonCodegenSettaFilesRootRequired
	}
	if project == nil {
		return projectstate.ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		return err
	}

	rendered, ok, err := m.renderProject(project.Clone())
	if err != nil {
		return err
	}
	if !ok {
		projectstate.RemoveSections(project, projectstate.GeneratedPythonSectionIDs(*project))
		return nil
	}

	removeUnmanagedPythonGeneratedSections(project, rendered.target.GenerateMetadata)
	if err := ensurePythonGeneratedSection(project, pythonGeneratedSectionSpec{
		sectionID:   projectstate.GeneratedPythonCodeSectionID,
		variantID:   projectstate.GeneratedPythonCodeVariantID,
		implID:      projectstate.GeneratedPythonCodeImplID,
		name:        projectstate.GeneratedPythonCodeSectionName,
		sectionType: "GenPythonCode",
		kind:        projectstate.GeneratedSectionKindPythonCode,
		code:        rendered.generatedBody,
		binding:     project.GeneratedCodeBinding,
	}); err != nil {
		return err
	}
	if rendered.target.GenerateMetadata {
		if err := ensurePythonGeneratedSection(project, pythonGeneratedSectionSpec{
			sectionID:   projectstate.GeneratedPythonMetadataSectionID,
			variantID:   projectstate.GeneratedPythonMetadataVariantID,
			implID:      projectstate.GeneratedPythonMetadataImplID,
			name:        projectstate.GeneratedPythonMetadataSectionName,
			sectionType: "GenPythonMetadata",
			kind:        projectstate.GeneratedSectionKindPythonMetadata,
			code:        rendered.metadataCode,
			binding:     project.GeneratedMetadataBinding,
		}); err != nil {
			return err
		}
	} else {
		projectstate.RemoveSections(project, []string{projectstate.GeneratedPythonMetadataSectionID})
	}
	return nil
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
	outputRoot := projectstate.ProjectCodeSectionsRoot(m.settaFilesRoot, project.Name)
	codePath := filepath.Join(outputRoot, projectstate.GeneratedPythonCodeFileName)
	metadataPath := filepath.Join(outputRoot, projectstate.GeneratedPythonMetadataFileName)
	rendered, ok, err := m.renderProject(project)
	if err != nil {
		return err
	}
	if !ok {
		if err := removePythonGeneratedFile(codePath); err != nil {
			return err
		}
		if err := removePythonGeneratedFile(metadataPath); err != nil {
			return err
		}
		return pruneEmptyProjectCodeRoot(outputRoot)
	}

	if rendered.target.GenerateMetadata {
		if err := statefs.AtomicWriteFile(metadataPath, []byte(rendered.metadataCode), 0o644); err != nil {
			return fmt.Errorf("write generated python metadata: %w", err)
		}
	}

	if err := statefs.AtomicWriteFile(codePath, []byte(rendered.code), 0o644); err != nil {
		return fmt.Errorf("write generated python code: %w", err)
	}

	if !rendered.target.GenerateMetadata {
		if err := removePythonGeneratedFile(metadataPath); err != nil {
			return err
		}
	}
	return nil
}

func (m *PythonMaterializer) renderProject(project projectstate.Project) (pythonRenderedProject, bool, error) {
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		return pythonRenderedProject{}, false, err
	}
	if !ok {
		return pythonRenderedProject{}, false, nil
	}

	exported, exportOK, err := project.PythonCodegenExport()
	if err != nil {
		return pythonRenderedProject{}, false, err
	}
	if !exportOK {
		return pythonRenderedProject{}, false, fmt.Errorf("codegen: python export missing for project %s", project.ID)
	}
	passwordSecrets, err := readPasswordSecrets(filepath.Join(m.runtimeRoot, "secrets", pythonPasswordStoreFileName))
	if err != nil {
		return pythonRenderedProject{}, false, err
	}
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PasswordSecrets: passwordSecrets,
	})
	if err != nil {
		return pythonRenderedProject{}, false, err
	}

	metadataCode := ""
	if target.GenerateMetadata {
		metaRenderer := NewPythonMetadataRenderer(exported, graph)
		metadataCode, err = metaRenderer.GenerateCode()
		if err != nil {
			return pythonRenderedProject{}, false, err
		}
	}

	codeRenderer := NewPythonCodeRenderer(graph, target.GenCodePrefix, target.GenCodeSuffix, PythonCodeRendererOptions{
		ValueMode: PythonValueModePackagedRuntime,
		MetaCode:  metadataCode,
	})
	codeRenderer.GenerateCode()

	return pythonRenderedProject{
		target:        target,
		code:          codeRenderer.Code,
		generatedBody: codeRenderer.GeneratedCode,
		metadataCode:  metadataCode,
	}, true, nil
}

func removeUnmanagedPythonGeneratedSections(project *projectstate.Project, metadataEnabled bool) {
	managedSectionIDs := map[string]struct{}{
		projectstate.GeneratedPythonCodeSectionID: {},
	}
	if metadataEnabled {
		managedSectionIDs[projectstate.GeneratedPythonMetadataSectionID] = struct{}{}
	}

	staleSectionIDs := make([]string, 0, len(project.Sections))
	for _, sectionID := range projectstate.GeneratedPythonSectionIDs(*project) {
		if _, ok := managedSectionIDs[sectionID]; ok {
			continue
		}
		staleSectionIDs = append(staleSectionIDs, sectionID)
	}
	projectstate.RemoveSections(project, staleSectionIDs)
}

func ensurePythonGeneratedSection(project *projectstate.Project, spec pythonGeneratedSectionSpec) error {
	if project == nil {
		return projectstate.ErrProjectNotFound
	}
	if project.SectionVariantMap == nil {
		project.SectionVariantMap = map[string]string{}
	}
	if project.Sections == nil {
		project.Sections = map[string]projectstate.Section{}
	}
	if project.SectionVariants == nil {
		project.SectionVariants = map[string]projectstate.SectionVariant{}
	}
	if project.SectionImpls == nil {
		project.SectionImpls = map[string]projectstate.SectionImpl{}
	}
	if project.TopLevelSections == nil {
		project.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
	}
	if !containsString(project.TopLevelSectionIDs, spec.sectionID) {
		project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, spec.sectionID)
	}
	if _, ok := project.TopLevelSections[spec.sectionID]; !ok {
		project.TopLevelSections[spec.sectionID] = projectstate.TopLevelSectionLayout{}
	}

	project.Sections[spec.sectionID] = projectstate.Section{
		ID:               spec.sectionID,
		Name:             spec.name,
		VariantIDs:       []string{spec.variantID},
		DefaultVariantID: spec.variantID,
	}
	project.SectionVariantMap[spec.sectionID] = spec.variantID
	project.SectionVariants[spec.variantID] = projectstate.SectionVariant{
		ID:     spec.variantID,
		ImplID: spec.implID,
	}

	payload, err := marshalGeneratedPythonSectionPayload(spec.implID, spec.sectionType, spec.code, spec.binding)
	if err != nil {
		return err
	}
	project.SectionImpls[spec.implID] = projectstate.SectionImpl{
		ID:      spec.implID,
		Kind:    projectstate.SectionKindGenerated,
		Payload: payload,
		Generated: &projectstate.GeneratedSectionImpl{
			Kind: spec.kind,
		},
	}

	for viewModeID, viewMode := range project.ViewModes {
		if viewMode.VisibilityBySectionID == nil {
			viewMode.VisibilityBySectionID = map[string]bool{}
		}
		if viewMode.TopLevelSections == nil {
			viewMode.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
		}
		viewMode.VisibilityBySectionID[spec.sectionID] = true
		if _, ok := viewMode.TopLevelSections[spec.sectionID]; !ok {
			viewMode.TopLevelSections[spec.sectionID] = projectstate.TopLevelSectionLayout{}
		}
		project.ViewModes[viewModeID] = viewMode
	}
	return nil
}

func marshalGeneratedPythonSectionPayload(
	implID string,
	sectionType string,
	code string,
	binding *projectstate.CodeFileBinding,
) (projectstate.RawJSON, error) {
	payload := map[string]any{
		"id":   implID,
		"type": sectionType,
		"code": code,
	}
	if binding != nil {
		payload["codeFileBinding"] = map[string]any{
			"canonical_path": binding.Path,
			"access_mode":    string(binding.AccessMode),
			"autoBinding":    false,
		}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal generated python section payload %q: %w", implID, err)
	}
	return projectstate.RawJSON(encoded), nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
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
