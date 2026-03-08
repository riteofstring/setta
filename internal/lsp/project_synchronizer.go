package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

type ProjectSynchronizerOptions struct {
	SettaFilesRoot              string
	RuntimeRoot                 string
	Service                     documentSyncer
	Diagnostics                 *projectstate.LSPDiagnosticsRegistry
	OnCallableSymbolsResolved   func(context.Context, string, []string)
	OnCallableSignatureMismatch func(context.Context, string, []string)
}

type documentSyncer interface {
	SyncDocuments(context.Context, map[string]SyncedDocument) error
	UpsertDocument(context.Context, SyncedDocument) error
	Close(context.Context) error
}

type ProjectSynchronizer struct {
	settaFilesRoot              string
	runtimeRoot                 string
	service                     documentSyncer
	diagnostics                 *projectstate.LSPDiagnosticsRegistry
	onCallableSymbolsResolved   func(context.Context, string, []string)
	onCallableSignatureMismatch func(context.Context, string, []string)
	generatedCallableStateMu    sync.Mutex
	generatedCallableState      map[string]generatedCallableDiagnosticsState
}

type generatedCallableDiagnosticsState struct {
	undefinedSections map[string]struct{}
	mismatchSections  map[string]struct{}
}

func NewProjectSynchronizer(options ProjectSynchronizerOptions) (*ProjectSynchronizer, error) {
	if options.Service == nil {
		return nil, fmt.Errorf("lsp: service is required")
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, fmt.Errorf("lsp: resolve setta files root: %w", err)
	}
	return &ProjectSynchronizer{
		settaFilesRoot:              settaFilesRoot,
		runtimeRoot:                 options.RuntimeRoot,
		service:                     options.Service,
		diagnostics:                 options.Diagnostics,
		onCallableSymbolsResolved:   options.OnCallableSymbolsResolved,
		onCallableSignatureMismatch: options.OnCallableSignatureMismatch,
		generatedCallableState:      map[string]generatedCallableDiagnosticsState{},
	}, nil
}

func (s *ProjectSynchronizer) MaterializeDocument(ctx context.Context, document projectstate.Document) error {
	if s == nil {
		return nil
	}

	documents, err := s.buildDocuments(document)
	if err != nil {
		return err
	}
	if err := s.service.SyncDocuments(ctx, documents); err != nil {
		return err
	}
	return s.reconcileGeneratedDiagnosticsState(document)
}

func (s *ProjectSynchronizer) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	return s.service.Close(ctx)
}

func (s *ProjectSynchronizer) SyncWatchCodeBoundSection(
	ctx context.Context,
	section projectstate.WatchCodeBoundSection,
) error {
	if s == nil || s.service == nil {
		return nil
	}

	if err := s.service.UpsertDocument(ctx, SyncedDocument{
		Path:       section.SourcePath,
		LanguageID: "python",
		Content:    section.Code,
	}); err != nil {
		return fmt.Errorf("lsp: upsert watch code bound section %q: %w", section.SectionID, err)
	}
	return nil
}

func (s *ProjectSynchronizer) SetCallableAutoRefetchHandlers(
	onCallableSymbolsResolved func(context.Context, string, []string),
	onCallableSignatureMismatch func(context.Context, string, []string),
) {
	if s == nil {
		return
	}
	s.generatedCallableStateMu.Lock()
	s.onCallableSymbolsResolved = onCallableSymbolsResolved
	s.onCallableSignatureMismatch = onCallableSignatureMismatch
	s.generatedCallableStateMu.Unlock()
}

func (s *ProjectSynchronizer) buildDocuments(document projectstate.Document) (map[string]SyncedDocument, error) {
	documents := map[string]SyncedDocument{}
	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		project := document.Projects[projectID]

		activeSectionFiles, err := project.ActiveCodeSectionFiles()
		if err != nil {
			return nil, fmt.Errorf("lsp: project %q active code sections: %w", projectID, err)
		}
		for _, sectionFile := range activeSectionFiles {
			ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection(sectionFile.SectionID)
			if err != nil {
				return nil, err
			}
			path, err := statefs.ResolveWithinRoot(s.settaFilesRoot, sectionFile.Binding.Path, "code section path")
			if err != nil {
				return nil, err
			}
			content, err := s.resolveSectionContent(path, sectionFile)
			if err != nil {
				return nil, err
			}
			documents[path] = SyncedDocument{
				Path:       path,
				LanguageID: string(sectionFile.Language),
				Content:    content,
				Callback:   s.codeSectionDiagnosticsCallback(project.ID, sectionFile.SectionID, ignoreState),
			}
		}

		generatedDocuments, err := s.generatedPythonDocuments(project)
		if err != nil {
			return nil, err
		}
		for path, document := range generatedDocuments {
			documents[path] = document
		}
	}

	return documents, nil
}

func (s *ProjectSynchronizer) resolveSectionContent(path string, sectionFile projectstate.ActiveCodeSectionFile) (string, error) {
	if sectionFile.HasInlineCode {
		if err := statefs.AtomicWriteFile(path, []byte(sectionFile.Code), 0o644); err != nil {
			return "", fmt.Errorf("lsp: write code section %q: %w", sectionFile.SectionID, err)
		}
		return sectionFile.Code, nil
	}

	content, err := os.ReadFile(path)
	if err == nil {
		return string(content), nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("lsp: read code section %q: %w", sectionFile.SectionID, err)
	}
	if err := statefs.AtomicWriteFile(path, []byte{}, 0o644); err != nil {
		return "", fmt.Errorf("lsp: initialize empty code section %q: %w", sectionFile.SectionID, err)
	}
	return "", nil
}

func (s *ProjectSynchronizer) codeSectionDiagnosticsCallback(
	projectID string,
	sectionID string,
	ignoreState projectstate.CodeSectionDiagnosticsIgnoreState,
) DiagnosticsCallback {
	if s == nil || s.diagnostics == nil {
		return nil
	}

	return func(params PublishDiagnosticsParams) {
		s.diagnostics.UpdateCodeSectionWithIgnoreState(projectID, sectionID, toProjectDiagnostics(params), ignoreState)
	}
}

func (s *ProjectSynchronizer) generatedPythonDocuments(project projectstate.Project) (map[string]SyncedDocument, error) {
	if !project.HasPythonCodegenTarget() {
		return map[string]SyncedDocument{}, nil
	}

	config, _, err := project.PythonCodegenTarget()
	if err != nil {
		return nil, err
	}
	mapper, err := s.generatedDiagnosticsMapper(project)
	if err != nil {
		return nil, err
	}

	documents := map[string]SyncedDocument{}
	generatedCodePath, err := s.resolveGeneratedPath(project.GeneratedCodeBinding, projectstate.GeneratedPythonCodeRelativePath(project.Name))
	if err != nil {
		return nil, err
	}
	generatedCode, err := os.ReadFile(generatedCodePath)
	if err != nil {
		return nil, fmt.Errorf("lsp: read generated python code %s: %w", generatedCodePath, err)
	}
	documents[generatedCodePath] = SyncedDocument{
		Path:       generatedCodePath,
		LanguageID: "python",
		Content:    string(generatedCode),
		Callback:   s.generatedCodeDiagnosticsCallback(project.ID, mapper),
	}

	if config.GenerateMetadata {
		generatedMetadataPath, err := s.resolveGeneratedPath(project.GeneratedMetadataBinding, projectstate.GeneratedPythonMetadataRelativePath(project.Name))
		if err != nil {
			return nil, err
		}
		generatedMetadata, err := os.ReadFile(generatedMetadataPath)
		if err != nil {
			return nil, fmt.Errorf("lsp: read generated python metadata %s: %w", generatedMetadataPath, err)
		}
		documents[generatedMetadataPath] = SyncedDocument{
			Path:       generatedMetadataPath,
			LanguageID: "python",
			Content:    string(generatedMetadata),
			Callback:   s.generatedMetadataDiagnosticsCallback(project.ID, mapper),
		}
	}

	return documents, nil
}

func (s *ProjectSynchronizer) resolveGeneratedPath(binding *projectstate.CodeFileBinding, fallbackRelativePath string) (string, error) {
	relativePath := fallbackRelativePath
	if binding != nil && binding.Path != "" {
		relativePath = binding.Path
	}
	return statefs.ResolveWithinRoot(s.settaFilesRoot, filepath.FromSlash(relativePath), "generated python path")
}

func toProjectDiagnostics(params PublishDiagnosticsParams) []projectstate.LSPDiagnostic {
	diagnostics := make([]projectstate.LSPDiagnostic, 0, len(params.Diagnostics))
	for _, diagnostic := range params.Diagnostics {
		diagnostics = append(diagnostics, projectstate.LSPDiagnostic{
			Message:  diagnostic.Message,
			Severity: pointerIfPositive(diagnostic.Severity),
			Code:     normalizeDiagnosticCode(diagnostic.Code),
			Source:   pointerIfNonEmpty(diagnostic.Source),
			Range: projectstate.LSPDiagnosticRange{
				Start: projectstate.LSPDiagnosticPosition{
					Line:      diagnostic.Range.Start.Line,
					Character: diagnostic.Range.Start.Character,
				},
				End: projectstate.LSPDiagnosticPosition{
					Line:      diagnostic.Range.End.Line,
					Character: diagnostic.Range.End.Character,
				},
			},
			URI: pointerIfNonEmpty(params.URI),
		})
	}
	return diagnostics
}

func pointerIfPositive(value int) *int {
	if value <= 0 {
		return nil
	}
	output := value
	return &output
}

func pointerIfNonEmpty(value string) *string {
	if value == "" {
		return nil
	}
	output := value
	return &output
}

func normalizeDiagnosticCode(value any) any {
	switch typed := value.(type) {
	case float64:
		if typed == float64(int(typed)) {
			return int(typed)
		}
		return typed
	default:
		return typed
	}
}

func (s *ProjectSynchronizer) generatedDiagnosticsMapper(project projectstate.Project) (*codegen.PythonGeneratedDiagnosticsMapper, error) {
	if s == nil || s.diagnostics == nil {
		return nil, nil
	}
	passwordSecrets, err := codegen.ReadPythonPasswordSecrets(s.runtimeRoot)
	if err != nil {
		return nil, err
	}
	mapper, ok, err := codegen.NewPythonGeneratedDiagnosticsMapper(project, codegen.PythonGeneratedDiagnosticsMapperOptions{
		PasswordSecrets: passwordSecrets,
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return mapper, nil
}

func (s *ProjectSynchronizer) generatedCodeDiagnosticsCallback(
	projectID string,
	mapper *codegen.PythonGeneratedDiagnosticsMapper,
) DiagnosticsCallback {
	if s == nil || s.diagnostics == nil || mapper == nil {
		return nil
	}

	return func(params PublishDiagnosticsParams) {
		result := mapper.AnalyzeCodeDiagnostics(toPythonGeneratedDiagnostics(params.Diagnostics), params.URI)
		s.diagnostics.UpdateGeneratedDocument(
			projectID,
			projectstate.GeneratedDiagnosticsDocumentCode,
			result.Diagnostics,
			result.Unmapped,
		)
		resolvedSections, newMismatchSections := s.reconcileGeneratedCallableDiagnostics(projectID, result)
		if len(resolvedSections) > 0 && s.onCallableSymbolsResolved != nil {
			s.onCallableSymbolsResolved(context.Background(), projectID, resolvedSections)
		}
		if len(newMismatchSections) > 0 && s.onCallableSignatureMismatch != nil {
			s.onCallableSignatureMismatch(context.Background(), projectID, newMismatchSections)
		}
	}
}

func (s *ProjectSynchronizer) generatedMetadataDiagnosticsCallback(
	projectID string,
	mapper *codegen.PythonGeneratedDiagnosticsMapper,
) DiagnosticsCallback {
	if s == nil || s.diagnostics == nil || mapper == nil {
		return nil
	}

	return func(params PublishDiagnosticsParams) {
		s.diagnostics.UpdateGeneratedDocument(
			projectID,
			projectstate.GeneratedDiagnosticsDocumentMetadata,
			projectstate.ProjectConfigDiagnostics{
				ProjectID: projectID,
				Errors:    map[string]projectstate.SectionTypeErrors{},
				IsGenCode: true,
			},
			mapper.MapMetadataDiagnostics(toPythonGeneratedDiagnostics(params.Diagnostics), params.URI),
		)
	}
}

func toPythonGeneratedDiagnostics(diagnostics []Diagnostic) []codegen.PythonGeneratedDiagnostic {
	output := make([]codegen.PythonGeneratedDiagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		output = append(output, codegen.PythonGeneratedDiagnostic{
			Message:  diagnostic.Message,
			Severity: diagnostic.Severity,
			Code:     normalizeDiagnosticCode(diagnostic.Code),
			Source:   diagnostic.Source,
			Range: projectstate.LSPDiagnosticRange{
				Start: projectstate.LSPDiagnosticPosition{
					Line:      diagnostic.Range.Start.Line,
					Character: diagnostic.Range.Start.Character,
				},
				End: projectstate.LSPDiagnosticPosition{
					Line:      diagnostic.Range.End.Line,
					Character: diagnostic.Range.End.Character,
				},
			},
		})
	}
	return output
}

func (s *ProjectSynchronizer) reconcileGeneratedDiagnosticsState(document projectstate.Document) error {
	if s == nil || s.diagnostics == nil {
		return nil
	}

	activeProjects := map[string]struct{}{}
	for projectID, project := range document.Projects {
		activeProjects[projectID] = struct{}{}
		if !project.HasPythonCodegenTarget() {
			s.diagnostics.ClearGeneratedDocument(projectID, projectstate.GeneratedDiagnosticsDocumentCode)
			s.diagnostics.ClearGeneratedDocument(projectID, projectstate.GeneratedDiagnosticsDocumentMetadata)
			s.clearGeneratedCallableState(projectID)
			continue
		}
		target, ok, err := project.PythonCodegenTarget()
		if err != nil {
			return err
		}
		if !ok || !target.GenerateMetadata {
			s.diagnostics.ClearGeneratedDocument(projectID, projectstate.GeneratedDiagnosticsDocumentMetadata)
		}
	}
	s.pruneGeneratedCallableState(activeProjects)
	return nil
}

func (s *ProjectSynchronizer) reconcileGeneratedCallableDiagnostics(
	projectID string,
	result codegen.PythonGeneratedCodeDiagnosticsResult,
) ([]string, []string) {
	if s == nil {
		return nil, nil
	}

	s.generatedCallableStateMu.Lock()
	state := s.generatedCallableState[projectID]
	resolvedSections := make([]string, 0, len(state.undefinedSections))
	for sectionID := range state.undefinedSections {
		if _, ok := result.UndefinedCallableSections[sectionID]; ok {
			continue
		}
		if sectionErrors, ok := result.Diagnostics.Errors[sectionID]; ok && len(sectionErrors.Callable) > 0 {
			continue
		}
		resolvedSections = append(resolvedSections, sectionID)
	}
	newMismatchSections := make([]string, 0, len(result.CallableMismatchSections))
	for sectionID := range result.CallableMismatchSections {
		if _, ok := state.mismatchSections[sectionID]; ok {
			continue
		}
		newMismatchSections = append(newMismatchSections, sectionID)
	}

	nextState := generatedCallableDiagnosticsState{
		undefinedSections: cloneGeneratedCallableSectionSet(result.UndefinedCallableSections),
		mismatchSections:  cloneGeneratedCallableSectionSet(result.CallableMismatchSections),
	}
	if len(nextState.undefinedSections) == 0 && len(nextState.mismatchSections) == 0 {
		delete(s.generatedCallableState, projectID)
	} else {
		s.generatedCallableState[projectID] = nextState
	}
	s.generatedCallableStateMu.Unlock()

	sort.Strings(resolvedSections)
	sort.Strings(newMismatchSections)
	return resolvedSections, newMismatchSections
}

func (s *ProjectSynchronizer) clearGeneratedCallableState(projectID string) {
	if s == nil {
		return
	}
	s.generatedCallableStateMu.Lock()
	delete(s.generatedCallableState, projectID)
	s.generatedCallableStateMu.Unlock()
}

func (s *ProjectSynchronizer) pruneGeneratedCallableState(activeProjects map[string]struct{}) {
	if s == nil {
		return
	}
	s.generatedCallableStateMu.Lock()
	for projectID := range s.generatedCallableState {
		if _, ok := activeProjects[projectID]; ok {
			continue
		}
		delete(s.generatedCallableState, projectID)
	}
	s.generatedCallableStateMu.Unlock()
}

func cloneGeneratedCallableSectionSet(source map[string]struct{}) map[string]struct{} {
	if len(source) == 0 {
		return map[string]struct{}{}
	}
	cloned := make(map[string]struct{}, len(source))
	for key := range source {
		cloned[key] = struct{}{}
	}
	return cloned
}
