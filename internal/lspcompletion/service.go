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
	project, err := snapshotProject(runtime, projectID)
	if err != nil {
		return err
	}
	if _, _, _, err := project.ResolveSection(strings.TrimSpace(sectionID)); err != nil {
		return err
	}
	return nil
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
	switch kind {
	case 1:
		return "File"
	case 2:
		return "Module"
	case 3:
		return "Namespace"
	case 4:
		return "Package"
	case 5:
		return "Class"
	case 6:
		return "Method"
	case 7:
		return "Property"
	case 8:
		return "Field"
	case 9:
		return "Constructor"
	case 10:
		return "Enum"
	case 11:
		return "Interface"
	case 12:
		return "Function"
	case 13:
		return "Variable"
	case 14:
		return "Constant"
	case 15:
		return "String"
	case 16:
		return "Number"
	case 17:
		return "Boolean"
	case 18:
		return "Array"
	case 19:
		return "Object"
	case 20:
		return "Key"
	case 21:
		return "Null"
	case 22:
		return "EnumMember"
	case 23:
		return "Struct"
	case 24:
		return "Event"
	case 25:
		return "Operator"
	case 26:
		return "TypeParameter"
	default:
		return ""
	}
}
