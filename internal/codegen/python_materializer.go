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
	"setta/internal/prompttemplates"
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

type RenderedPythonProject struct {
	Target        projectstate.PythonCodegenTarget
	Code          string
	GeneratedBody string
	MetadataCode  string
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

	removeUnmanagedPythonGeneratedSections(project, rendered.Target.GenerateMetadata)
	if err := ensurePythonGeneratedSection(project, pythonGeneratedSectionSpec{
		sectionID:   projectstate.GeneratedPythonCodeSectionID,
		variantID:   projectstate.GeneratedPythonCodeVariantID,
		implID:      projectstate.GeneratedPythonCodeImplID,
		name:        projectstate.GeneratedPythonCodeSectionName,
		sectionType: "GenPythonCode",
		kind:        projectstate.GeneratedSectionKindPythonCode,
		code:        rendered.GeneratedBody,
		binding:     project.GeneratedCodeBinding,
	}); err != nil {
		return err
	}
	if rendered.Target.GenerateMetadata {
		if err := ensurePythonGeneratedSection(project, pythonGeneratedSectionSpec{
			sectionID:   projectstate.GeneratedPythonMetadataSectionID,
			variantID:   projectstate.GeneratedPythonMetadataVariantID,
			implID:      projectstate.GeneratedPythonMetadataImplID,
			name:        projectstate.GeneratedPythonMetadataSectionName,
			sectionType: "GenPythonMetadata",
			kind:        projectstate.GeneratedSectionKindPythonMetadata,
			code:        rendered.MetadataCode,
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

	if rendered.Target.GenerateMetadata {
		if err := statefs.AtomicWriteFile(metadataPath, []byte(rendered.MetadataCode), 0o644); err != nil {
			return fmt.Errorf("write generated python metadata: %w", err)
		}
	}

	if err := statefs.AtomicWriteFile(codePath, []byte(rendered.Code), 0o644); err != nil {
		return fmt.Errorf("write generated python code: %w", err)
	}

	if !rendered.Target.GenerateMetadata {
		if err := removePythonGeneratedFile(metadataPath); err != nil {
			return err
		}
	}
	return nil
}

func (m *PythonMaterializer) renderProject(project projectstate.Project) (RenderedPythonProject, bool, error) {
	return RenderPythonProject(project, m.settaFilesRoot, m.runtimeRoot)
}

func RenderPythonProject(project projectstate.Project, settaFilesRoot string, runtimeRoot string) (RenderedPythonProject, bool, error) {
	resolvedSettaFilesRoot, err := statefs.NormalizePath(settaFilesRoot, "")
	if err != nil {
		return RenderedPythonProject{}, false, ErrPythonCodegenSettaFilesRootRequired
	}
	resolvedRuntimeRoot, err := statefs.NormalizePath(runtimeRoot, "")
	if err != nil {
		return RenderedPythonProject{}, false, ErrPythonCodegenRuntimeRootRequired
	}
	return renderPythonProject(project, resolvedSettaFilesRoot, resolvedRuntimeRoot)
}

func renderPythonProject(project projectstate.Project, settaFilesRoot string, runtimeRoot string) (RenderedPythonProject, bool, error) {
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		return RenderedPythonProject{}, false, err
	}
	if !ok {
		return RenderedPythonProject{}, false, nil
	}

	exported, exportOK, err := project.PythonCodegenExport()
	if err != nil {
		return RenderedPythonProject{}, false, err
	}
	if !exportOK {
		return RenderedPythonProject{}, false, fmt.Errorf("codegen: python export missing for project %s", project.ID)
	}
	passwordSecrets, err := readPasswordSecrets(filepath.Join(runtimeRoot, "secrets", pythonPasswordStoreFileName))
	if err != nil {
		return RenderedPythonProject{}, false, err
	}
	promptTemplateStore, err := prompttemplates.NewStore(settaFilesRoot)
	if err != nil {
		return RenderedPythonProject{}, false, err
	}
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PasswordSecrets: passwordSecrets,
		PromptTemplates: promptTemplateStore,
	})
	if err != nil {
		return RenderedPythonProject{}, false, err
	}

	metadataCode := ""
	if target.GenerateMetadata {
		metaRenderer := NewPythonMetadataRenderer(exported, graph)
		metadataCode, err = metaRenderer.GenerateCode()
		if err != nil {
			return RenderedPythonProject{}, false, err
		}
	}

	codeRenderer := NewPythonCodeRenderer(graph, target.GenCodePrefix, target.GenCodeSuffix, PythonCodeRendererOptions{
		ValueMode: PythonValueModePackagedRuntime,
		MetaCode:  metadataCode,
	})
	codeRenderer.GenerateCode()

	return RenderedPythonProject{
		Target:        target,
		Code:          codeRenderer.Code,
		GeneratedBody: codeRenderer.GeneratedCode,
		MetadataCode:  metadataCode,
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

	section := project.Sections[spec.sectionID]
	section.ID = spec.sectionID
	section.Name = spec.name
	section.ParentSectionID = ""
	section.VariantIDs = []string{spec.variantID}
	section.DefaultVariantID = spec.variantID
	project.Sections[spec.sectionID] = section
	project.SectionVariantMap[spec.sectionID] = spec.variantID
	variant := project.SectionVariants[spec.variantID]
	variant.ID = spec.variantID
	variant.ImplID = spec.implID
	project.SectionVariants[spec.variantID] = variant

	payload, err := marshalGeneratedPythonSectionPayload(project, spec)
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
		if _, ok := viewMode.VisibilityBySectionID[spec.sectionID]; !ok {
			viewMode.VisibilityBySectionID[spec.sectionID] = true
		}
		if _, ok := viewMode.TopLevelSections[spec.sectionID]; !ok {
			viewMode.TopLevelSections[spec.sectionID] = projectstate.TopLevelSectionLayout{}
		}
		project.ViewModes[viewModeID] = viewMode
	}
	return nil
}

func marshalGeneratedPythonSectionPayload(
	project *projectstate.Project,
	spec pythonGeneratedSectionSpec,
) (projectstate.RawJSON, error) {
	payload, err := existingGeneratedPythonSectionPayload(project, spec.sectionID)
	if err != nil {
		return nil, err
	}
	if payload == nil {
		payload = map[string]any{}
	}
	applyGeneratedPythonSectionPayloadDefaults(payload)
	payload["id"] = spec.implID
	payload["type"] = spec.sectionType
	payload["code"] = spec.code
	payload["codeFileBinding"] = nil
	if spec.binding != nil {
		payload["codeFileBinding"] = map[string]any{
			"canonical_path": spec.binding.Path,
			"access_mode":    string(spec.binding.AccessMode),
			"autoBinding":    false,
		}
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal generated python section payload %q: %w", spec.implID, err)
	}
	return projectstate.RawJSON(encoded), nil
}

func existingGeneratedPythonSectionPayload(
	project *projectstate.Project,
	sectionID string,
) (map[string]any, error) {
	if project == nil {
		return nil, projectstate.ErrProjectNotFound
	}
	variantID, ok := project.SectionVariantMap[sectionID]
	if !ok {
		return nil, nil
	}
	variant, ok := project.SectionVariants[variantID]
	if !ok {
		return nil, nil
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok || len(impl.Payload) == 0 {
		return nil, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		return nil, fmt.Errorf(
			"decode existing generated python payload %q: %w",
			sectionID,
			err,
		)
	}
	return payload, nil
}

func applyGeneratedPythonSectionPayloadDefaults(payload map[string]any) {
	if payload == nil {
		return
	}
	size, ok := payload["size"].(map[string]any)
	if !ok {
		size = map[string]any{}
		payload["size"] = size
	}
	if _, ok := size["width"]; !ok {
		size["width"] = 500.0
	}
	if _, ok := size["height"]; !ok {
		size["height"] = 150.0
	}
	if _, ok := payload["children"]; !ok {
		payload["children"] = []string{}
	}
	if _, ok := payload["attachedTerminalSectionId"]; !ok {
		payload["attachedTerminalSectionId"] = nil
	}
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

func ReadPythonPasswordSecrets(runtimeRoot string) (map[string]string, error) {
	if strings.TrimSpace(runtimeRoot) == "" {
		return map[string]string{}, nil
	}
	return readPasswordSecrets(filepath.Join(runtimeRoot, "secrets", pythonPasswordStoreFileName))
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
