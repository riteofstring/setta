package lspcompletion

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"setta/internal/codegen"
	"setta/internal/lsp"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

type CodeMirrorCompletion struct {
	Label string `json:"label"`
	Type  string `json:"type"`
}

type ServiceOptions struct {
	SettaFilesRoot string
	RuntimeRoot    string
	LSPService     snapshotCompleter
}

type Service struct {
	settaFilesRoot string
	runtimeRoot    string
	lspService     snapshotCompleter
}

var tempSnapshotLabelPattern = regexp.MustCompile(`__[0-9a-f]{32}$`)

var completionKindTypes = [...]string{
	"",
	"File",
	"Module",
	"Namespace",
	"Package",
	"Class",
	"Method",
	"Property",
	"Field",
	"Constructor",
	"Enum",
	"Interface",
	"Function",
	"Variable",
	"Constant",
	"String",
	"Number",
	"Boolean",
	"Array",
	"Object",
	"Key",
	"Null",
	"EnumMember",
	"Struct",
	"Event",
	"Operator",
	"TypeParameter",
}

type snapshotCompleter interface {
	CompleteSnapshot(context.Context, lsp.SnapshotCompletionRequest) (lsp.CompletionResult, error)
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.LSPService == nil {
		return nil, fmt.Errorf("lspcompletion: lsp service is required")
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, fmt.Errorf("lspcompletion: resolve setta files root: %w", err)
	}
	runtimeRoot := ""
	if strings.TrimSpace(options.RuntimeRoot) != "" {
		runtimeRoot, err = statefs.NormalizePath(options.RuntimeRoot, "")
		if err != nil {
			return nil, fmt.Errorf("lspcompletion: resolve runtime root: %w", err)
		}
	}
	return &Service{
		settaFilesRoot: settaFilesRoot,
		runtimeRoot:    runtimeRoot,
		lspService:     options.LSPService,
	}, nil
}

func (s *Service) CodeAreaCompletion(
	ctx context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	sectionID string,
	fullText string,
	position int,
) ([]CodeMirrorCompletion, error) {
	project, err := snapshotProject(runtime, projectID)
	if err != nil {
		return nil, err
	}
	request, ok, err := BuildCodeAreaSnapshotRequest(project, sectionID, fullText, position)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []CodeMirrorCompletion{}, nil
	}
	return s.completeSnapshot(ctx, request)
}

func (s *Service) TextFieldCompletion(
	ctx context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	sectionID string,
	paramInfoID string,
	fullText string,
	position int,
) ([]CodeMirrorCompletion, error) {
	project, err := snapshotProject(runtime, projectID)
	if err != nil {
		return nil, err
	}
	passwordSecrets, err := codegen.ReadPythonPasswordSecrets(s.runtimeRoot)
	if err != nil {
		return nil, err
	}
	request, ok, err := BuildPythonTextFieldSnapshotRequest(project, passwordSecrets, sectionID, paramInfoID, fullText, position)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []CodeMirrorCompletion{}, nil
	}
	return s.completeSnapshot(ctx, request)
}

func (s *Service) ClearTextFieldCompletion(
	_ context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	sectionID string,
	_ string,
) error {
	_, err := snapshotProject(runtime, projectID)
	return err
}

func (s *Service) OutputAccessorCompletion(
	ctx context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	sectionID string,
	fullText string,
	position int,
) ([]CodeMirrorCompletion, error) {
	project, err := snapshotProject(runtime, projectID)
	if err != nil {
		return nil, err
	}
	passwordSecrets, err := codegen.ReadPythonPasswordSecrets(s.runtimeRoot)
	if err != nil {
		return nil, err
	}
	request, ok, err := BuildPythonOutputAccessorSnapshotRequest(project, passwordSecrets, sectionID, fullText, position)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []CodeMirrorCompletion{}, nil
	}
	return s.completeSnapshot(ctx, request)
}

func (s *Service) GenCodePrefixCompletion(
	ctx context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	fullText string,
	position int,
) ([]CodeMirrorCompletion, error) {
	project, err := snapshotProject(runtime, projectID)
	if err != nil {
		return nil, err
	}
	passwordSecrets, err := codegen.ReadPythonPasswordSecrets(s.runtimeRoot)
	if err != nil {
		return nil, err
	}
	request, ok, err := BuildPythonGenCodePrefixSnapshotRequest(project, passwordSecrets, fullText, position)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []CodeMirrorCompletion{}, nil
	}
	return s.completeSnapshot(ctx, request)
}

func (s *Service) GenCodeSuffixCompletion(
	ctx context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	fullText string,
	position int,
) ([]CodeMirrorCompletion, error) {
	project, err := snapshotProject(runtime, projectID)
	if err != nil {
		return nil, err
	}
	passwordSecrets, err := codegen.ReadPythonPasswordSecrets(s.runtimeRoot)
	if err != nil {
		return nil, err
	}
	request, ok, err := BuildPythonGenCodeSuffixSnapshotRequest(project, passwordSecrets, fullText, position)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []CodeMirrorCompletion{}, nil
	}
	return s.completeSnapshot(ctx, request)
}

func (s *Service) completeSnapshot(
	ctx context.Context,
	request SnapshotRequest,
) ([]CodeMirrorCompletion, error) {
	if s == nil || s.lspService == nil {
		return nil, lsp.ErrSessionClosed
	}
	referencePath, err := statefs.ResolveWithinRoot(
		s.settaFilesRoot,
		filepath.FromSlash(request.RelativePath),
		"lsp completion path",
	)
	if err != nil {
		return nil, err
	}
	result, err := s.lspService.CompleteSnapshot(ctx, lsp.SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    request.LanguageID,
		Content:       request.Content,
		Line:          request.Line,
		Character:     request.Character,
	})
	if err != nil {
		if errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
			return []CodeMirrorCompletion{}, nil
		}
		return nil, err
	}
	return mapCodeMirrorCompletions(result), nil
}

func snapshotProject(runtime *projectstate.Runtime, projectID string) (projectstate.Project, error) {
	if runtime == nil {
		return projectstate.Project{}, projectstate.ErrRuntimeClosed
	}
	snapshot := runtime.Snapshot()
	return snapshot.Document.ProjectByID(projectID)
}

func mapCodeMirrorCompletions(result lsp.CompletionResult) []CodeMirrorCompletion {
	output := make([]CodeMirrorCompletion, 0, len(result.Items))
	for _, item := range result.Items {
		if tempSnapshotLabelPattern.MatchString(item.Label) {
			continue
		}
		output = append(output, CodeMirrorCompletion{
			Label: item.Label,
			Type:  completionKindType(item.Kind),
		})
	}
	return output
}

func completionKindType(kind int) string {
	if kind <= 0 || kind >= len(completionKindTypes) {
		return ""
	}
	return completionKindTypes[kind]
}
