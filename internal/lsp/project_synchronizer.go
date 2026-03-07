package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

type ProjectSynchronizerOptions struct {
	SettaFilesRoot string
	Service        *Service
	Diagnostics    *projectstate.LSPDiagnosticsRegistry
}

type ProjectSynchronizer struct {
	settaFilesRoot string
	service        *Service
	diagnostics    *projectstate.LSPDiagnosticsRegistry
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
		settaFilesRoot: settaFilesRoot,
		service:        options.Service,
		diagnostics:    options.Diagnostics,
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
	return s.service.SyncDocuments(ctx, documents)
}

func (s *ProjectSynchronizer) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	return s.service.Close(ctx)
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

		sectionFiles, err := project.ActivePythonCodeSectionFiles()
		if err != nil {
			return nil, fmt.Errorf("lsp: project %q active python code sections: %w", projectID, err)
		}
		for _, sectionFile := range sectionFiles {
			path, err := statefs.ResolveWithinRoot(s.settaFilesRoot, sectionFile.Binding.Path, "python code section path")
			if err != nil {
				return nil, err
			}
			content, err := s.resolveSectionContent(path, sectionFile)
			if err != nil {
				return nil, err
			}
			documents[path] = SyncedDocument{
				Path:       path,
				LanguageID: "python",
				Content:    content,
				Callback:   s.codeSectionDiagnosticsCallback(project.ID, sectionFile.SectionID),
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

func (s *ProjectSynchronizer) resolveSectionContent(path string, sectionFile projectstate.PythonCodeSectionFile) (string, error) {
	if sectionFile.HasInlineCode {
		if err := statefs.AtomicWriteFile(path, []byte(sectionFile.Code), 0o644); err != nil {
			return "", fmt.Errorf("lsp: write python code section %q: %w", sectionFile.SectionID, err)
		}
		return sectionFile.Code, nil
	}

	content, err := os.ReadFile(path)
	if err == nil {
		return string(content), nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("lsp: read python code section %q: %w", sectionFile.SectionID, err)
	}
	if err := statefs.AtomicWriteFile(path, []byte{}, 0o644); err != nil {
		return "", fmt.Errorf("lsp: initialize empty python code section %q: %w", sectionFile.SectionID, err)
	}
	return "", nil
}

func (s *ProjectSynchronizer) codeSectionDiagnosticsCallback(projectID string, sectionID string) DiagnosticsCallback {
	if s == nil || s.diagnostics == nil {
		return nil
	}

	return func(params PublishDiagnosticsParams) {
		s.diagnostics.UpdateCodeSection(projectID, sectionID, toProjectDiagnostics(params))
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
