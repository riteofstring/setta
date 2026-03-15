package filebrowser

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
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

type FolderContentItem struct {
	Name               string   `json:"name"`
	Type               string   `json:"type"`
	FullPath           string   `json:"fullPath"`
	Mtime              *float64 `json:"mtime,omitempty"`
	Size               *int64   `json:"size,omitempty"`
	IsSettaInitialized *bool    `json:"isSettaInitialized,omitempty"`
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
	resolved, err := s.resolveFolderPath(request.FolderPath, request.AllowOutsideWorkspaceRoot)
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

func (s *Service) ListFolder(_ context.Context, request ListFolderRequest) ([]FolderContentItem, error) {
	resolved, err := s.resolveFolderPath(request.FolderPath, request.AllowOutsideWorkspaceRoot)
	if err != nil {
		return nil, err
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) {
			if strings.TrimSpace(request.MissingFolderBehavior) == "empty" {
				return []FolderContentItem{}, nil
			}
			return nil, &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("Path does not exist: %s", request.FolderPath),
			}
		}
		return nil, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat folder: %s", request.FolderPath),
		}
	}
	if !info.IsDir() {
		return nil, &Error{
			Kind:    ErrorPathNotDirectory,
			Message: fmt.Sprintf("Path is not a directory: %s", request.FolderPath),
		}
	}

	ignorePatterns := request.IgnorePatterns
	if ignorePatterns == nil {
		ignorePatterns = DefaultIgnorePatterns
	}
	maxEntries := DefaultMaxEntries
	if request.MaxEntries != nil && *request.MaxEntries >= 0 {
		maxEntries = *request.MaxEntries
	}
	internalIgnoreRoots := s.internalIgnoreRoots()
	entries, err := os.ReadDir(resolved)
	if err != nil {
		return nil, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read folder: %s", request.FolderPath),
		}
	}

	items := make([]FolderContentItem, 0, len(entries))
	for _, entry := range entries {
		entryPath := filepath.Join(resolved, entry.Name())
		if s.isUnderIgnoredRoot(entryPath, internalIgnoreRoots) {
			continue
		}
		if shouldIgnoreName(entry.Name(), ignorePatterns) {
			continue
		}

		info, statErr := os.Stat(entryPath)
		if statErr != nil {
			continue
		}

		item := FolderContentItem{
			Name:     entry.Name(),
			Type:     "file",
			FullPath: s.formatBrowserPath(entryPath),
		}
		if info.IsDir() {
			item.Type = "folder"
		}
		if request.IncludeMtime {
			value := float64(info.ModTime().UnixNano()) / float64(time.Second)
			item.Mtime = &value
		}
		if request.IncludeSize {
			value := info.Size()
			item.Size = &value
		}
		if request.IncludeSettaInitialized && info.IsDir() {
			value := s.isInitializedWorkspaceFolder(entryPath)
			item.IsSettaInitialized = &value
		}
		items = append(items, item)
		if len(items) >= maxEntries {
			break
		}
	}

	sort.Slice(items, func(i int, j int) bool {
		left := items[i]
		right := items[j]
		if left.Type != right.Type {
			return left.Type == "folder"
		}
		return strings.ToLower(left.Name) < strings.ToLower(right.Name)
	})
	return items, nil
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
	maxBytes := int64(DefaultMaxFileContentBytes)
	if request.MaxBytes != nil && *request.MaxBytes > 0 && *request.MaxBytes < maxBytes {
		maxBytes = *request.MaxBytes
	}

	file, err := os.Open(resolved)
	if err != nil {
		return FileContentResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read file: %s", request.Path),
		}
	}
	defer file.Close()

	statBefore, err := file.Stat()
	if err != nil {
		return FileContentResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read file: %s", request.Path),
		}
	}
	content, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return FileContentResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read file: %s", request.Path),
		}
	}
	statAfter, err := file.Stat()
	if err != nil {
		return FileContentResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read file: %s", request.Path),
		}
	}
	if int64(len(content)) > maxBytes {
		return FileContentResponse{}, &Error{
			Kind:    ErrorTooLarge,
			Message: fmt.Sprintf("File exceeds max size (%d bytes): %s", maxBytes, request.Path),
		}
	}
	if statBefore.Size() != statAfter.Size() || statBefore.ModTime().UnixNano() != statAfter.ModTime().UnixNano() {
		return FileContentResponse{}, &Error{
			Kind:    ErrorConflict,
			Message: "File changed on disk while reading.",
		}
	}

	mimeType := guessMimeType(resolved)
	ref, err := s.binaryStore.StoreBytes(content, mimeType, false)
	if err != nil {
		return FileContentResponse{}, fmt.Errorf("store file browser payload: %w", err)
	}
	return FileContentResponse{
		Path:      s.formatBrowserPath(resolved),
		MimeType:  mimeType,
		ContentID: ref.ContentID,
		MtimeNs:   statAfter.ModTime().UnixNano(),
		Size:      statAfter.Size(),
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
	resolved, err := s.resolveFilePathForEdit(request.Path, true)
	if err != nil {
		return WriteFileContentResponse{}, err
	}
	payload, err := s.binaryStore.ReadBytes(request.ContentID)
	if err != nil {
		return WriteFileContentResponse{}, &Error{
			Kind:    ErrorBinaryPayloadInvalid,
			Message: "Invalid binary content payload.",
		}
	}
	if int64(len(payload)) > DefaultMaxFileContentBytes {
		return WriteFileContentResponse{}, &Error{
			Kind:    ErrorTooLarge,
			Message: fmt.Sprintf("Updated file content exceeds maximum supported size (%d bytes).", DefaultMaxFileContentBytes),
		}
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return WriteFileContentResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to write file: %s", request.Path),
		}
	}

	if request.ExpectedMtimeNs == nil {
		if err := writeCreateOnlyFile(resolved, payload); err != nil {
			if errors.Is(err, os.ErrExist) {
				return WriteFileContentResponse{}, &Error{
					Kind:    ErrorConflict,
					Message: "File already exists.",
				}
			}
			return WriteFileContentResponse{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Failed to write file: %s", request.Path),
			}
		}
	} else {
		existingInfo, err := os.Stat(resolved)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return WriteFileContentResponse{}, &Error{
					Kind:    ErrorConflict,
					Message: "File changed on disk since it was loaded.",
				}
			}
			return WriteFileContentResponse{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Failed to stat file: %s", request.Path),
			}
		}
		if existingInfo.ModTime().UnixNano() != *request.ExpectedMtimeNs {
			return WriteFileContentResponse{}, &Error{
				Kind:    ErrorConflict,
				Message: "File changed on disk since it was loaded.",
			}
		}
		if err := statefs.AtomicWriteFile(resolved, payload, existingInfo.Mode().Perm()); err != nil {
			return WriteFileContentResponse{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Failed to write file: %s", request.Path),
			}
		}
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

func (s *Service) Transfer(_ context.Context, request TransferRequest) (TransferResponse, error) {
	if request.Operation != TransferOperationCopy && request.Operation != TransferOperationMove {
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Invalid transfer operation.",
		}
	}
	source, err := s.resolveExistingWorkspaceEntry(request.SourcePath)
	if err != nil {
		return TransferResponse{}, err
	}
	destinationFolder, err := s.resolveFolderPath(request.DestinationFolderPath, false)
	if err != nil {
		return TransferResponse{}, err
	}
	destinationInfo, err := os.Stat(destinationFolder)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return TransferResponse{}, &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("Destination folder does not exist: %s", request.DestinationFolderPath),
			}
		}
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Destination is not a folder: %s", request.DestinationFolderPath),
		}
	}
	if !destinationInfo.IsDir() {
		return TransferResponse{}, &Error{
			Kind:    ErrorPathNotDirectory,
			Message: fmt.Sprintf("Destination is not a folder: %s", request.DestinationFolderPath),
		}
	}

	sourceCompare, err := resolveForComparison(source)
	if err != nil {
		return TransferResponse{}, err
	}
	workspaceCompare, err := resolveForComparison(s.workspaceRoot)
	if err != nil {
		return TransferResponse{}, err
	}
	if samePath(sourceCompare, workspaceCompare) {
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Cannot move or copy the workspace root.",
		}
	}
	destinationFolderCompare, err := resolveForComparison(destinationFolder)
	if err != nil {
		return TransferResponse{}, err
	}
	if sourceInfo, err := os.Stat(source); err == nil && sourceInfo.IsDir() {
		if isWithinRoot(sourceCompare, destinationFolderCompare) {
			return TransferResponse{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: "Cannot move or copy a folder into itself.",
			}
		}
	}

	if request.Operation == TransferOperationCopy {
		destination, err := resolveCopyDestinationPath(source, destinationFolder)
		if err != nil {
			return TransferResponse{}, err
		}
		if err := copyPath(source, destination); err != nil {
			return TransferResponse{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Failed to copy path: %s", request.SourcePath),
			}
		}
		return TransferResponse{
			SourcePath:      s.formatBrowserPath(source),
			DestinationPath: s.formatBrowserPath(destination),
			Operation:       request.Operation,
		}, nil
	}

	destination := filepath.Join(destinationFolder, filepath.Base(source))
	destinationCompare, err := resolveForComparison(destination)
	if err != nil {
		return TransferResponse{}, err
	}
	if samePath(sourceCompare, destinationCompare) {
		return TransferResponse{
			SourcePath:      s.formatBrowserPath(source),
			DestinationPath: s.formatBrowserPath(destination),
			Operation:       request.Operation,
		}, nil
	}
	if _, err := os.Stat(destination); err == nil {
		return TransferResponse{}, &Error{
			Kind:    ErrorConflict,
			Message: fmt.Sprintf("Destination already exists: %s", destination),
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to move path: %s", request.SourcePath),
		}
	}
	if err := movePath(source, destination); err != nil {
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to move path: %s", request.SourcePath),
		}
	}
	return TransferResponse{
		SourcePath:      s.formatBrowserPath(source),
		DestinationPath: s.formatBrowserPath(destination),
		Operation:       request.Operation,
	}, nil
}

func (s *Service) Download(_ context.Context, token string) (DownloadResult, error) {
	secret, err := s.requireSessionSecret()
	if err != nil {
		return DownloadResult{}, err
	}
	payload, err := validateDownloadToken(strings.TrimSpace(token), secret, s.timeNow())
	if err != nil {
		return DownloadResult{}, err
	}
	resolved, ok := s.resolveFilePathForDownload(payload.Path)
	if !ok {
		return DownloadResult{}, &Error{
			Kind:    ErrorPathNotFound,
			Message: "File not found.",
		}
	}
	info, err := os.Stat(resolved)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DownloadResult{}, &Error{
				Kind:    ErrorPathNotFound,
				Message: "File not found.",
			}
		}
		return DownloadResult{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: "File path is not a file.",
		}
	}
	if !info.Mode().IsRegular() {
		return DownloadResult{}, &Error{
			Kind:    ErrorPathNotFile,
			Message: "File path is not a file.",
		}
	}
	return DownloadResult{
		Path:      resolved,
		MediaType: guessMimeType(resolved),
	}, nil
}

func (s *Service) resolveFolderPath(raw string, allowOutsideWorkspaceRoot bool) (string, error) {
	resolved, err := statefs.NormalizePath(raw, s.workspaceRoot)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Missing folder path.",
		}
	}
	if allowOutsideWorkspaceRoot {
		return resolved, nil
	}
	return s.ensureWithinWorkspaceRoot(resolved, "Folder path")
}

func (s *Service) resolvePathWithinWorkspace(raw string, label string) (string, error) {
	resolved, err := statefs.NormalizePath(raw, s.workspaceRoot)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Missing %s.", strings.ToLower(label)),
		}
	}
	return s.ensureWithinWorkspaceRoot(resolved, label)
}

func (s *Service) ensureWithinWorkspaceRoot(resolved string, label string) (string, error) {
	if !isWithinRoot(s.workspaceRoot, resolved) {
		return "", &Error{
			Kind:    ErrorPathForbidden,
			Message: fmt.Sprintf("%s must be within the project root.", label),
		}
	}
	return resolved, nil
}

func (s *Service) resolveFilePathForDownload(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false
	}
	resolved, err := s.resolvePathWithinWorkspace(trimmed, "File path")
	if err != nil {
		return "", false
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil || info.IsDir() {
		return "", false
	}
	return resolved, true
}

func (s *Service) resolveFilePathForEdit(raw string, allowMissing bool) (string, error) {
	resolved, err := s.resolvePathWithinWorkspace(raw, "File path")
	if err != nil {
		return "", err
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) && allowMissing {
			return resolved, nil
		}
		if errors.Is(statErr, os.ErrNotExist) {
			return "", &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("File does not exist: %s", raw),
			}
		}
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", raw),
		}
	}
	if !info.Mode().IsRegular() {
		return "", &Error{
			Kind:    ErrorPathNotFile,
			Message: fmt.Sprintf("Path is not a file: %s", raw),
		}
	}
	return resolved, nil
}

func (s *Service) resolveExistingWorkspaceEntry(raw string) (string, error) {
	resolved, err := s.resolvePathWithinWorkspace(raw, "File path")
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(resolved); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("Path does not exist: %s", raw),
			}
		}
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", raw),
		}
	}
	return resolved, nil
}

func (s *Service) formatBrowserPath(path string) string {
	resolved, err := statefs.NormalizePath(path, s.workspaceRoot)
	if err != nil {
		return strings.TrimSpace(path)
	}
	return resolved
}

func (s *Service) internalIgnoreRoots() []string {
	roots := make([]string, 0, 2)
	for _, root := range []string{s.settaFilesRoot, s.runtimeRoot} {
		if isWithinRoot(s.workspaceRoot, root) {
			roots = append(roots, root)
		}
	}
	return roots
}

func (s *Service) isUnderIgnoredRoot(path string, ignoredRoots []string) bool {
	for _, root := range ignoredRoots {
		if isWithinRoot(root, path) {
			return true
		}
	}
	info, err := os.Lstat(path)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		return false
	}
	resolved, err := resolveForComparison(path)
	if err != nil {
		return false
	}
	for _, root := range ignoredRoots {
		rootCompare, err := resolveForComparison(root)
		if err != nil {
			continue
		}
		if samePath(rootCompare, resolved) || isWithinRoot(rootCompare, resolved) {
			return true
		}
	}
	return false
}

func (s *Service) isInitializedWorkspaceFolder(path string) bool {
	for _, folderName := range localSettaFolderNames {
		candidate := filepath.Join(path, folderName)
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return true
		}
	}
	globalRoot := config.BuildFilesRootFromBase(s.globalSettaFilesBase, path)
	if info, err := os.Stat(globalRoot); err == nil && info.IsDir() {
		return true
	}
	return false
}

func (s *Service) requireSessionSecret() ([]byte, error) {
	currentSession, ok := s.sessions.CurrentSession()
	if !ok || currentSession == nil || len(currentSession.Secret) == 0 {
		return nil, &Error{
			Kind:    ErrorTokenUnavailable,
			Message: "File browser token secret unavailable.",
		}
	}
	return currentSession.Secret, nil
}

func shouldIgnoreName(name string, patterns []string) bool {
	for _, pattern := range patterns {
		matched, err := filepath.Match(pattern, name)
		if err == nil && matched {
			return true
		}
	}
	return false
}

func writeCreateOnlyFile(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Write(payload); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return nil
}

func resolveCopyDestinationPath(source string, destinationFolder string) (string, error) {
	direct := filepath.Join(destinationFolder, filepath.Base(source))
	if _, err := os.Stat(direct); errors.Is(err, os.ErrNotExist) {
		return direct, nil
	}
	for attempt := 1; attempt < 10_000; attempt++ {
		candidate := filepath.Join(destinationFolder, buildCopyCandidateName(filepath.Base(source), attempt))
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			return candidate, nil
		}
	}
	return "", &Error{
		Kind:    ErrorConflict,
		Message: fmt.Sprintf("Unable to resolve copy destination for %s.", filepath.Base(source)),
	}
}

func buildCopyCandidateName(sourceName string, attempt int) string {
	hasOnlyLeadingDot := strings.HasPrefix(sourceName, ".") && !strings.Contains(sourceName[1:], ".")
	baseName := sourceName
	suffix := ""
	if !hasOnlyLeadingDot {
		allSuffixes := suffixes(sourceName)
		suffix = strings.Join(allSuffixes, "")
		if trimmed := strings.TrimSuffix(sourceName, suffix); trimmed != "" {
			baseName = trimmed
		}
	}
	if attempt == 1 {
		return fmt.Sprintf("%s copy%s", baseName, suffix)
	}
	return fmt.Sprintf("%s copy %d%s", baseName, attempt, suffix)
}

func suffixes(name string) []string {
	base := filepath.Base(name)
	var parts []string
	for {
		ext := filepath.Ext(base)
		if ext == "" {
			break
		}
		parts = append([]string{ext}, parts...)
		base = strings.TrimSuffix(base, ext)
		if base == "" {
			break
		}
	}
	return parts
}

func copyPath(source string, destination string) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDirectory(source, destination, info)
	}
	return copyFile(source, destination, info)
}

func copyDirectory(source string, destination string, info os.FileInfo) error {
	if err := os.MkdirAll(destination, info.Mode().Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(source)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		sourceChild := filepath.Join(source, entry.Name())
		destinationChild := filepath.Join(destination, entry.Name())
		if err := copyPath(sourceChild, destinationChild); err != nil {
			return err
		}
	}
	return os.Chtimes(destination, info.ModTime(), info.ModTime())
}

func copyFile(source string, destination string, info os.FileInfo) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return err
	}
	defer output.Close()
	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	if err := output.Sync(); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	return os.Chtimes(destination, info.ModTime(), info.ModTime())
}

func movePath(source string, destination string) error {
	if err := os.Rename(source, destination); err == nil {
		return nil
	} else {
		var linkErr *os.LinkError
		if !errors.As(err, &linkErr) || !errors.Is(linkErr.Err, syscall.EXDEV) {
			return err
		}
	}
	if err := copyPath(source, destination); err != nil {
		return err
	}
	return os.RemoveAll(source)
}

func resolveForComparison(path string) (string, error) {
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return statefs.NormalizePath(resolved, "")
	}
	return statefs.NormalizePath(path, "")
}

func isWithinRoot(root string, candidate string) bool {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return false
	}
	resolvedCandidate, err := statefs.NormalizePath(candidate, "")
	if err != nil {
		return false
	}
	relative, err := filepath.Rel(resolvedRoot, resolvedCandidate)
	if err != nil {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func samePath(left string, right string) bool {
	resolvedLeft, err := statefs.NormalizePath(left, "")
	if err != nil {
		return false
	}
	resolvedRight, err := statefs.NormalizePath(right, "")
	if err != nil {
		return false
	}
	return resolvedLeft == resolvedRight
}

func guessMimeType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	if mimeType := mime.TypeByExtension(ext); strings.TrimSpace(mimeType) != "" {
		mediaType, _, err := mime.ParseMediaType(mimeType)
		if err == nil && strings.TrimSpace(mediaType) != "" {
			return mediaType
		}
		return mimeType
	}
	return "application/octet-stream"
}

func mintDownloadToken(payload downloadTokenPayload, secret []byte) (string, error) {
	content, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(content)
	mac := hmac.New(sha256.New, secret)
	if _, err := mac.Write([]byte(body)); err != nil {
		return "", err
	}
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + signature, nil
}

func validateDownloadToken(token string, secret []byte, now time.Time) (downloadTokenPayload, error) {
	var payload downloadTokenPayload
	body, signature, found := strings.Cut(token, ".")
	if !found || strings.TrimSpace(body) == "" || strings.TrimSpace(signature) == "" {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	mac := hmac.New(sha256.New, secret)
	if _, err := mac.Write([]byte(body)); err != nil {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	content, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	if err := json.Unmarshal(content, &payload); err != nil {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	if strings.TrimSpace(payload.Path) == "" || payload.Exp <= now.Unix() {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	return payload, nil
}
