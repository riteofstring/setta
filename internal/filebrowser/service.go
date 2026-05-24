package filebrowser

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/statefs"
)

const (
	DefaultMaxEntries          = 5000
	DefaultMaxFileContentBytes = 10 * 1024 * 1024
	defaultTokenTTL            = 10 * time.Minute
)

var DefaultIgnorePatterns = []string{
	".git",
	"node_modules",
	".venv",
	"dist",
	"build",
	"__pycache__",
}

var workspacePythonMarkerFiles = map[string]struct{}{
	"pyproject.toml":       {},
	"requirements.txt":     {},
	"requirements-dev.txt": {},
	"setup.py":             {},
	"setup.cfg":            {},
	"pipfile":              {},
	"tox.ini":              {},
	"poetry.lock":          {},
	"uv.lock":              {},
}

var localSettaFolderNames = []string{"setta_files", "setta_files_dev"}

type ErrorKind string

const (
	ErrorInvalidRequest       ErrorKind = "invalid_request"
	ErrorPathForbidden        ErrorKind = "path_forbidden"
	ErrorPathNotFound         ErrorKind = "path_not_found"
	ErrorPathNotFile          ErrorKind = "path_not_file"
	ErrorPathNotDirectory     ErrorKind = "path_not_directory"
	ErrorConflict             ErrorKind = "conflict"
	ErrorTooLarge             ErrorKind = "too_large"
	ErrorBinaryPayloadInvalid ErrorKind = "binary_payload_invalid"
	ErrorTokenUnavailable     ErrorKind = "token_unavailable"
	ErrorInvalidDownloadToken ErrorKind = "invalid_download_token"
)

type Error struct {
	Kind    ErrorKind
	Message string
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type SessionProvider interface {
	CurrentSession() (*auth.CurrentSession, bool)
}

type ServiceOptions struct {
	WorkspaceRoot        string
	SettaFilesRoot       string
	RuntimeRoot          string
	GlobalSettaFilesBase string
	BinaryStore          *binarypayload.Store
	Sessions             SessionProvider
	TimeNow              func() time.Time
}

type Service struct {
	workspaceRoot        string
	settaFilesRoot       string
	runtimeRoot          string
	globalSettaFilesBase string
	binaryStore          *binarypayload.Store
	sessions             SessionProvider
	timeNow              func() time.Time
	tokenTTL             time.Duration
}

type RootResponse struct {
	RootPath       string   `json:"rootPath"`
	PathSeparator  string   `json:"pathSeparator"`
	IgnorePatterns []string `json:"ignorePatterns"`
}

type CheckWorkspaceInitializedRequest struct {
	FolderPath                string
	AllowOutsideWorkspaceRoot bool
}

type ListFolderRequest struct {
	BaseFolderPath            string
	FolderPath                string
	AllowOutsideWorkspaceRoot bool
	IncludeMtime              bool
	IncludeSize               bool
	IncludeHidden             bool
	IncludeSettaInitialized   bool
	IgnorePatterns            []string
	MaxEntries                *int
	MissingFolderBehavior     string
}

type FolderContentItemType string

const (
	FolderContentItemTypeFolder FolderContentItemType = "folder"
	FolderContentItemTypeFile   FolderContentItemType = "file"
)

type FolderContentItem struct {
	Name               string                `json:"name"`
	Type               FolderContentItemType `json:"type"`
	FullPath           string                `json:"fullPath"`
	Mtime              *float64              `json:"mtime,omitempty"`
	Size               *int64                `json:"size,omitempty"`
	IsSettaInitialized *bool                 `json:"isSettaInitialized,omitempty"`
}

type ListFolderResponse struct {
	FolderPath string              `json:"folderPath"`
	Items      []FolderContentItem `json:"items"`
}

type listFolderSettings struct {
	ignorePatterns []string
	maxEntries     int
}

type WorkspacePythonSignalResponse struct {
	FolderPath string `json:"folderPath"`
	HasPython  bool   `json:"hasPython"`
}

type FileBrowserDownloadURLRequest struct {
	Paths []string
}

type FileBrowserDownloadURLEntry struct {
	Path      string `json:"path"`
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expiresAt"`
}

type FileContentRequest struct {
	Path     string
	MaxBytes *int64
}

type FileContentResponse struct {
	Path      string `json:"path"`
	MimeType  string `json:"mimeType"`
	ContentID string `json:"contentId"`
	MtimeNs   int64  `json:"mtimeNs"`
	Size      int64  `json:"size"`
}

type fileContentSnapshot struct {
	content []byte
	info    os.FileInfo
}

type FileStatResponse struct {
	Path    string `json:"path"`
	MtimeNs int64  `json:"mtimeNs"`
	Size    int64  `json:"size"`
}

type WriteFileContentRequest struct {
	Path            string
	ContentID       string
	ExpectedMtimeNs *int64
}

type WriteFileContentResponse struct {
	Path     string `json:"path"`
	MimeType string `json:"mimeType"`
	MtimeNs  int64  `json:"mtimeNs"`
	Size     int64  `json:"size"`
}

type TransferOperation string

const (
	TransferOperationCopy TransferOperation = "copy"
	TransferOperationMove TransferOperation = "move"
)

type TransferRequest struct {
	SourcePath            string
	DestinationFolderPath string
	Operation             TransferOperation
}

type TransferResponse struct {
	SourcePath      string            `json:"sourcePath"`
	DestinationPath string            `json:"destinationPath"`
	Operation       TransferOperation `json:"operation"`
}

type transferPlan struct {
	requestSourcePath string
	source            string
	sourceCompare     string
	destinationFolder string
	operation         TransferOperation
}

type DownloadResult struct {
	Path      string
	MediaType string
}

type downloadTokenPayload struct {
	Path string `json:"path"`
	Exp  int64  `json:"exp"`
}

func NewService(options ServiceOptions) (*Service, error) {
	workspaceRoot, err := statefs.NormalizePath(options.WorkspaceRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve workspace root: %w", err)
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve setta files root: %w", err)
	}
	runtimeRoot, err := statefs.NormalizePath(options.RuntimeRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve runtime root: %w", err)
	}
	globalSettaFilesBase, err := statefs.NormalizePath(options.GlobalSettaFilesBase, "")
	if err != nil {
		return nil, fmt.Errorf("resolve global setta files base: %w", err)
	}
	if options.BinaryStore == nil {
		return nil, fmt.Errorf("binary store is required")
	}
	if options.Sessions == nil {
		return nil, fmt.Errorf("session provider is required")
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Service{
		workspaceRoot:        workspaceRoot,
		settaFilesRoot:       settaFilesRoot,
		runtimeRoot:          runtimeRoot,
		globalSettaFilesBase: globalSettaFilesBase,
		binaryStore:          options.BinaryStore,
		sessions:             options.Sessions,
		timeNow:              timeNow,
		tokenTTL:             defaultTokenTTL,
	}, nil
}

func (s *Service) CreateFile(_ context.Context, rawPath string) error {
	resolved, err := s.resolvePathWithinWorkspace(rawPath, "File path")
	if err != nil {
		return err
	}

	info, statErr := os.Stat(resolved)
	if statErr == nil {
		if info.Mode().IsRegular() {
			return nil
		}
		return &Error{
			Kind:    ErrorPathNotFile,
			Message: fmt.Sprintf("Path is not a file: %s", rawPath),
		}
	}
	if !errors.Is(statErr, os.ErrNotExist) {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", rawPath),
		}
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to create file: %s", rawPath),
		}
	}

	file, err := os.OpenFile(resolved, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to create file: %s", rawPath),
		}
	}
	if err := file.Close(); err != nil {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to close file: %s", rawPath),
		}
	}
	return nil
}

func (s *Service) Root(_ context.Context) RootResponse {
	return RootResponse{
		RootPath:       s.workspaceRoot,
		PathSeparator:  string(os.PathSeparator),
		IgnorePatterns: append([]string{}, DefaultIgnorePatterns...),
	}
}

func (s *Service) CheckIfFileExists(_ context.Context, rawPath string) (bool, error) {
	trimmed := strings.TrimSpace(rawPath)
	if trimmed == "" {
		return false, nil
	}
	resolved, err := s.resolvePathWithinWorkspace(trimmed, "File path")
	if err != nil {
		return false, err
	}
	_, statErr := os.Stat(resolved)
	if statErr == nil {
		return true, nil
	}
	if errors.Is(statErr, os.ErrNotExist) {
		return false, nil
	}
	return false, &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Failed to stat file: %s", rawPath),
	}
}

func (s *Service) CheckWorkspaceInitialized(_ context.Context, request CheckWorkspaceInitializedRequest) (bool, error) {
	resolved, err := s.resolveFolderPath(
		request.FolderPath,
		"",
		request.AllowOutsideWorkspaceRoot,
	)
	if err != nil {
		return false, err
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) {
			return false, nil
		}
		return false, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat folder: %s", request.FolderPath),
		}
	}
	if !info.IsDir() {
		return false, nil
	}
	return s.isInitializedWorkspaceFolder(resolved), nil
}

func (s *Service) ListFolder(_ context.Context, request ListFolderRequest) (ListFolderResponse, error) {
	resolved, err := s.resolveFolderPath(
		request.FolderPath,
		request.BaseFolderPath,
		request.AllowOutsideWorkspaceRoot,
	)
	if err != nil {
		return ListFolderResponse{}, err
	}
	response := ListFolderResponse{
		FolderPath: s.formatBrowserPath(resolved),
	}
	isEmpty, err := ensureListFolderTarget(resolved, request.FolderPath, request.MissingFolderBehavior)
	if err != nil {
		return ListFolderResponse{}, err
	}
	if isEmpty {
		response.Items = []FolderContentItem{}
		return response, nil
	}
	settings := buildListFolderSettings(request)
	items, err := s.collectFolderItems(resolved, request, settings)
	if err != nil {
		return ListFolderResponse{}, err
	}
	sortFolderContentItems(items)
	response.Items = limitFolderContentItems(items, settings.maxEntries)
	return response, nil
}

func (s *Service) WorkspacePythonSignal(_ context.Context, rawPath string) (WorkspacePythonSignalResponse, error) {
	resolved, err := s.resolveFolderPath(rawPath, "", false)
	if err != nil {
		return WorkspacePythonSignalResponse{}, err
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) {
			return WorkspacePythonSignalResponse{}, &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("Path does not exist: %s", rawPath),
			}
		}
		return WorkspacePythonSignalResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat folder: %s", rawPath),
		}
	}
	if !info.IsDir() {
		return WorkspacePythonSignalResponse{}, &Error{
			Kind:    ErrorPathNotDirectory,
			Message: fmt.Sprintf("Path is not a directory: %s", rawPath),
		}
	}

	return WorkspacePythonSignalResponse{
		FolderPath: s.formatBrowserPath(resolved),
		HasPython:  s.folderHasPythonSignals(resolved),
	}, nil
}

func (s *Service) BuildDownloadURLs(_ context.Context, request FileBrowserDownloadURLRequest, buildURL func(token string) string) ([]FileBrowserDownloadURLEntry, error) {
	if len(request.Paths) == 0 {
		return []FileBrowserDownloadURLEntry{}, nil
	}
	secret, err := s.requireSessionSecret()
	if err != nil {
		return nil, err
	}
	now := s.timeNow()
	expiresAt := now.Add(s.tokenTTL).Unix()
	entries := make([]FileBrowserDownloadURLEntry, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		resolved, ok := s.resolveFilePathForDownload(rawPath)
		if !ok {
			continue
		}
		normalized := s.formatBrowserPath(resolved)
		token, err := mintDownloadToken(downloadTokenPayload{
			Path: normalized,
			Exp:  expiresAt,
		}, secret)
		if err != nil {
			return nil, &Error{
				Kind:    ErrorTokenUnavailable,
				Message: "File browser token secret unavailable.",
			}
		}
		entries = append(entries, FileBrowserDownloadURLEntry{
			Path:      normalized,
			URL:       buildURL(token),
			ExpiresAt: expiresAt,
		})
	}
	return entries, nil
}

func (s *Service) ReadFileContent(_ context.Context, request FileContentRequest) (FileContentResponse, error) {
	resolved, err := s.resolveFilePathForEdit(request.Path, false)
	if err != nil {
		return FileContentResponse{}, err
	}
	snapshot, err := readStableFileContent(resolved, resolveReadMaxBytes(request), request.Path)
	if err != nil {
		return FileContentResponse{}, err
	}
	mimeType := guessMimeType(resolved)
	ref, err := s.binaryStore.StoreBytes(snapshot.content, mimeType, false)
	if err != nil {
		return FileContentResponse{}, fmt.Errorf("store file browser payload: %w", err)
	}
	return FileContentResponse{
		Path:      s.formatBrowserPath(resolved),
		MimeType:  mimeType,
		ContentID: ref.ContentID,
		MtimeNs:   snapshot.info.ModTime().UnixNano(),
		Size:      snapshot.info.Size(),
	}, nil
}

func (s *Service) StatFile(_ context.Context, rawPath string) (FileStatResponse, error) {
	resolved, err := s.resolveFilePathForEdit(rawPath, false)
	if err != nil {
		return FileStatResponse{}, err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return FileStatResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", rawPath),
		}
	}
	return FileStatResponse{
		Path:    s.formatBrowserPath(resolved),
		MtimeNs: info.ModTime().UnixNano(),
		Size:    info.Size(),
	}, nil
}

func (s *Service) WriteFileContent(_ context.Context, request WriteFileContentRequest) (WriteFileContentResponse, error) {
	resolved, payload, err := s.prepareWriteFileContent(request)
	if err != nil {
		return WriteFileContentResponse{}, err
	}
	if err := s.writeFileContentBytes(resolved, payload, request); err != nil {
		return WriteFileContentResponse{}, err
	}
	updatedInfo, err := os.Stat(resolved)
	if err != nil {
		return WriteFileContentResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", request.Path),
		}
	}
	return WriteFileContentResponse{
		Path:     s.formatBrowserPath(resolved),
		MimeType: guessMimeType(resolved),
		MtimeNs:  updatedInfo.ModTime().UnixNano(),
		Size:     updatedInfo.Size(),
	}, nil
}
