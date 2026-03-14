package artifacts

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	binarypayload "setta/internal/binary"
	"setta/internal/statefs"
)

const defaultFileMode = 0o644

type ErrorKind string

const (
	ErrorInvalidRequest          ErrorKind = "invalid_request"
	ErrorPathForbidden           ErrorKind = "path_forbidden"
	ErrorPathNotFound            ErrorKind = "path_not_found"
	ErrorPathNotFile             ErrorKind = "path_not_file"
	ErrorBinaryPayloadInvalid    ErrorKind = "binary_payload_invalid"
	ErrorBinaryPayloadNotFound   ErrorKind = "binary_payload_not_found"
	ErrorArtifactTypeUnsupported ErrorKind = "artifact_type_unsupported"
	ErrorPolicyDenied            ErrorKind = "policy_denied"
	ErrorTooLarge                ErrorKind = "too_large"
	ErrorMimeNotAllowed          ErrorKind = "mime_not_allowed"
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

type ServiceOptions struct {
	WorkspaceRoot  string
	SettaFilesRoot string
	ArtifactsRoot  string
	BinaryStore    *binarypayload.Store
	TimeNow        func() time.Time
}

type Service struct {
	workspaceRoot  string
	settaFilesRoot string
	artifactsRoot  string
	binaryStore    *binarypayload.Store
	timeNow        func() time.Time

	mu            sync.RWMutex
	metadata      map[string]artifactMetadata
	images        map[string]ImageArtifact
	chartData     map[string]ChartDataArtifact
	jsonArtifacts map[string]JSONArtifact
	files         map[string]FileArtifact
}

type artifactMetadata struct {
	LastKnownHash string
}

type importAction struct {
	artifactID string
	targetPath string
	name       string
	mimeType   string
	content    []byte
}

type updateAction struct {
	artifactType ArtifactType
	artifactID   string
	targetPath   string
	mimeType     string
	payload      []byte
	payloadHash  string
	jsonValue    json.RawMessage
	fileRef      *binarypayload.ContentRef
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
	artifactsRoot, err := statefs.NormalizePath(options.ArtifactsRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve artifacts root: %w", err)
	}
	if _, err := statefs.EnsureWithinRoot(settaFilesRoot, artifactsRoot, "artifacts root"); err != nil {
		return nil, fmt.Errorf("artifacts root must be within setta files root: %w", err)
	}
	if options.BinaryStore == nil {
		return nil, fmt.Errorf("binary store is required")
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Service{
		workspaceRoot:  workspaceRoot,
		settaFilesRoot: settaFilesRoot,
		artifactsRoot:  artifactsRoot,
		binaryStore:    options.BinaryStore,
		timeNow:        timeNow,
		metadata:       map[string]artifactMetadata{},
		images:         map[string]ImageArtifact{},
		chartData:      map[string]ChartDataArtifact{},
		jsonArtifacts:  map[string]JSONArtifact{},
		files:          map[string]FileArtifact{},
	}, nil
}

func (s *Service) ImportFiles(_ context.Context, request ImportFilesRequest) ([]ImportFilesResponseItem, error) {
	if len(request.Paths) == 0 {
		return []ImportFilesResponseItem{}, nil
	}
	actions := make([]importAction, 0, len(request.Paths))
	results := make([]ImportFilesResponseItem, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		resolvedPath, err := s.resolveWorkspaceFile(rawPath)
		if err != nil {
			return nil, err
		}
		info, err := os.Stat(resolvedPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, &Error{
					Kind:    ErrorPathNotFound,
					Message: fmt.Sprintf("File does not exist: %s", rawPath),
				}
			}
			return nil, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Failed to stat file: %s", rawPath),
			}
		}
		if info.IsDir() {
			return nil, &Error{
				Kind:    ErrorPathNotFile,
				Message: fmt.Sprintf("Path is not a file: %s", rawPath),
			}
		}
		content, err := os.ReadFile(resolvedPath)
		if err != nil {
			return nil, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Failed to read file: %s", rawPath),
			}
		}
		mimeType := guessMimeType(resolvedPath, "")
		if err := enforceUploadPolicy(request.UploadScope, filepath.Base(resolvedPath), mimeType, len(content)); err != nil {
			return nil, err
		}
		artifactID, targetPath, err := s.newArtifactTargetPath(joinedExtensions(filepath.Base(resolvedPath)))
		if err != nil {
			return nil, err
		}
		actions = append(actions, importAction{
			artifactID: artifactID,
			targetPath: targetPath,
			name:       filepath.Base(resolvedPath),
			mimeType:   mimeType,
			content:    content,
		})
		results = append(results, ImportFilesResponseItem{
			Kind:     "file",
			ID:       artifactID,
			Name:     filepath.Base(resolvedPath),
			MimeType: mimeType,
			Size:     len(content),
		})
	}
	for _, action := range actions {
		if err := statefs.AtomicWriteFile(action.targetPath, action.content, defaultFileMode); err != nil {
			return nil, fmt.Errorf("write imported artifact: %w", err)
		}
		ref, err := s.binaryStore.StoreBytes(action.content, action.mimeType, true)
		if err != nil {
			return nil, err
		}
		s.storeFileCache(action.targetPath, FileArtifact{
			Type:  ArtifactTypeFile,
			ID:    action.artifactID,
			Value: ref,
		}, hashBytes(action.content))
	}
	return results, nil
}

func (s *Service) LoadCachedImages(_ context.Context, request LoadCachedPathsRequest) ([]*ImageArtifact, error) {
	results := make([]*ImageArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedImage(rawPath)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) LoadCachedChartData(_ context.Context, request LoadCachedPathsRequest) ([]*ChartDataArtifact, error) {
	results := make([]*ChartDataArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedChart(rawPath)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) LoadCachedBrushStrokes(_ context.Context, request LoadCachedPathsRequest) ([]*JSONArtifact, error) {
	results := make([]*JSONArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedJSON(rawPath, ArtifactTypeBrushStroke)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) LoadCachedDrawAreaLayerItemTransforms(_ context.Context, request LoadCachedPathsRequest) ([]*JSONArtifact, error) {
	results := make([]*JSONArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedJSON(rawPath, ArtifactTypeDrawAreaLayerItemTransform)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) Update(_ context.Context, request UpdateRequest) ([]ArtifactSaveResult, error) {
	if len(request.Artifacts) == 0 {
		return []ArtifactSaveResult{}, nil
	}
	strategy := SaveConflictStrategyBackup
	if request.ConflictStrategy != nil {
		strategy = *request.ConflictStrategy
	}
	actions := make([]updateAction, 0, len(request.Artifacts))
	for _, artifact := range request.Artifacts {
		action, err := s.buildUpdateAction(artifact, request.UploadScope)
		if err != nil {
			return nil, err
		}
		actions = append(actions, action)
	}
	results := make([]ArtifactSaveResult, 0, len(actions))
	for _, action := range actions {
		result, err := s.applyUpdateAction(action, strategy)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func (s *Service) Delete(_ context.Context, request DeleteRequest) ([]string, error) {
	if len(request.Artifacts) == 0 {
		return []string{}, nil
	}
	deleted := make([]string, 0, len(request.Artifacts))
	for _, item := range request.Artifacts {
		if item.Type != ArtifactTypeFile {
			return nil, &Error{
				Kind:    ErrorArtifactTypeUnsupported,
				Message: fmt.Sprintf("Delete artifacts only supports File artifacts. Got %s.", item.Type),
			}
		}
		artifactID, resolvedPath, err := s.resolveArtifactPath(item.ID)
		if err != nil {
			return nil, err
		}
		if info, err := os.Stat(resolvedPath); err == nil && info.IsDir() {
			return nil, &Error{
				Kind:    ErrorPathNotFile,
				Message: fmt.Sprintf("Artifact path is a directory: %s", item.ID),
			}
		}
		s.mu.Lock()
		if cached, ok := s.files[resolvedPath]; ok {
			delete(s.files, resolvedPath)
			_ = s.binaryStore.Delete(cached.Value.ContentID)
		}
		delete(s.metadata, resolvedPath)
		s.mu.Unlock()
		if err := os.Remove(resolvedPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("delete artifact: %w", err)
		}
		deleted = append(deleted, artifactID)
	}
	return deleted, nil
}

func (s *Service) buildUpdateAction(artifact RawArtifact, scope UploadScope) (updateAction, error) {
	artifactID, targetPath, err := s.resolveArtifactPath(artifact.ID)
	if err != nil {
		return updateAction{}, err
	}
	switch artifact.Type {
	case ArtifactTypeFile:
		if artifact.Value == nil {
			return updateAction{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
			}
		}
		var ref binarypayload.ContentRef
		if err := json.Unmarshal(*artifact.Value, &ref); err != nil {
			return updateAction{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s has an invalid file payload.", artifactID),
			}
		}
		content, err := s.binaryStore.ReadBytes(ref.ContentID)
		if err != nil {
			switch {
			case errors.Is(err, binarypayload.ErrInvalidContentID), errors.Is(err, binarypayload.ErrContentIDRequired):
				return updateAction{}, &Error{
					Kind:    ErrorBinaryPayloadInvalid,
					Message: "Invalid binary content id.",
				}
			case errors.Is(err, binarypayload.ErrPayloadNotFound):
				return updateAction{}, &Error{
					Kind:    ErrorBinaryPayloadNotFound,
					Message: "Binary payload not found.",
				}
			default:
				return updateAction{}, err
			}
		}
		mimeType := guessMimeType(targetPath, ref.MimeType)
		if err := enforceUploadPolicy(scope, artifactID, mimeType, len(content)); err != nil {
			return updateAction{}, err
		}
		return updateAction{
			artifactType: artifact.Type,
			artifactID:   artifactID,
			targetPath:   targetPath,
			mimeType:     mimeType,
			payload:      content,
			payloadHash:  hashBytes(content),
			fileRef:      &ref,
		}, nil
	case ArtifactTypeBrushStroke, ArtifactTypeDrawAreaLayerItemTransform:
		if artifact.Value == nil {
			return updateAction{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
			}
		}
		canonicalJSON, err := canonicalizeJSONObject(*artifact.Value)
		if err != nil {
			return updateAction{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s has an invalid JSON value.", artifactID),
			}
		}
		return updateAction{
			artifactType: artifact.Type,
			artifactID:   artifactID,
			targetPath:   targetPath,
			payload:      canonicalJSON,
			payloadHash:  hashBytes(canonicalJSON),
			jsonValue:    canonicalJSON,
		}, nil
	case ArtifactTypeImage, ArtifactTypeChartData:
		return updateAction{}, &Error{
			Kind:    ErrorArtifactTypeUnsupported,
			Message: fmt.Sprintf("Artifact type %s is not supported by this route yet.", artifact.Type),
		}
	default:
		return updateAction{}, &Error{
			Kind:    ErrorArtifactTypeUnsupported,
			Message: fmt.Sprintf("Artifact type %s is not supported.", artifact.Type),
		}
	}
}

func (s *Service) applyUpdateAction(action updateAction, strategy SaveConflictStrategy) (ArtifactSaveResult, error) {
	s.mu.RLock()
	metadata := s.metadata[action.targetPath]
	s.mu.RUnlock()
	if metadata.LastKnownHash != "" && metadata.LastKnownHash == action.payloadHash {
		return ArtifactSaveResult{
			ID:     action.artifactID,
			Type:   action.artifactType,
			Status: SaveStatusUnchanged,
		}, nil
	}

	currentHash, exists, err := fileHash(action.targetPath)
	if err != nil {
		return ArtifactSaveResult{}, err
	}

	var (
		status     = SaveStatusSaved
		backupPath *string
		message    *string
	)
	if metadata.LastKnownHash != "" && currentHash != metadata.LastKnownHash {
		switch strategy {
		case SaveConflictStrategySkip:
			skippedMessage := "Skipped save due to detected external changes."
			return ArtifactSaveResult{
				ID:      action.artifactID,
				Type:    action.artifactType,
				Status:  SaveStatusSkipped,
				Message: &skippedMessage,
			}, nil
		case SaveConflictStrategyBackup:
			if exists {
				createdBackup, err := s.createConflictBackup(action.targetPath)
				if err != nil {
					return ArtifactSaveResult{}, err
				}
				normalizedBackup, err := s.normalizeResolvedArtifactID(createdBackup)
				if err == nil {
					backupPath = &normalizedBackup
				}
			}
			conflictMessage := "External changes detected."
			if backupPath != nil {
				conflictMessage = fmt.Sprintf("External changes detected. Previous contents copied to %s.", *backupPath)
			}
			message = &conflictMessage
			status = SaveStatusConflict
		case SaveConflictStrategyOverwrite:
			conflictMessage := "External changes detected. Overwriting per requested strategy."
			message = &conflictMessage
			status = SaveStatusConflict
		default:
			return ArtifactSaveResult{}, &Error{
				Kind:    ErrorInvalidRequest,
				Message: fmt.Sprintf("Invalid conflict strategy: %q", strategy),
			}
		}
	}

	if err := statefs.AtomicWriteFile(action.targetPath, action.payload, defaultFileMode); err != nil {
		return ArtifactSaveResult{}, fmt.Errorf("write artifact: %w", err)
	}

	switch action.artifactType {
	case ArtifactTypeFile:
		ref, err := s.binaryStore.StoreBytes(action.payload, action.mimeType, true)
		if err != nil {
			return ArtifactSaveResult{}, err
		}
		s.storeFileCache(action.targetPath, FileArtifact{
			Type:  ArtifactTypeFile,
			ID:    action.artifactID,
			Value: ref,
		}, action.payloadHash)
	case ArtifactTypeBrushStroke, ArtifactTypeDrawAreaLayerItemTransform:
		s.storeJSONCache(action.targetPath, JSONArtifact{
			Type:  action.artifactType,
			ID:    action.artifactID,
			Value: cloneRawJSON(action.jsonValue),
		}, action.payloadHash)
	default:
		return ArtifactSaveResult{}, &Error{
			Kind:    ErrorArtifactTypeUnsupported,
			Message: fmt.Sprintf("Artifact type %s is not supported.", action.artifactType),
		}
	}

	return ArtifactSaveResult{
		ID:         action.artifactID,
		Type:       action.artifactType,
		Status:     status,
		BackupPath: backupPath,
		Message:    message,
	}, nil
}

func (s *Service) loadCachedImage(rawPath string) (*ImageArtifact, error) {
	artifactID, resolvedPath, err := s.resolveArtifactPath(rawPath)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, nil
	}
	hash := hashBytes(content)

	s.mu.RLock()
	if cached, ok := s.images[resolvedPath]; ok {
		if metadata := s.metadata[resolvedPath]; metadata.LastKnownHash == hash {
			cloned := cached
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	mimeType := guessMimeType(resolvedPath, "")
	ref, err := s.binaryStore.StoreBytes(content, mimeType, true)
	if err != nil {
		return nil, err
	}
	artifact := ImageArtifact{
		Type:  ArtifactTypeImage,
		ID:    artifactID,
		Value: ref,
	}
	s.storeImageCache(resolvedPath, artifact, hash)
	cloned := artifact
	return &cloned, nil
}

func (s *Service) loadCachedChart(rawPath string) (*ChartDataArtifact, error) {
	artifactID, resolvedPath, err := s.resolveArtifactPath(rawPath)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, nil
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return nil, nil
	}
	hash := hashBytes(content)

	s.mu.RLock()
	if cached, ok := s.chartData[resolvedPath]; ok {
		if metadata := s.metadata[resolvedPath]; metadata.LastKnownHash == hash {
			cloned := cloneChartDataArtifact(cached)
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	value, err := parseChartCSV(content)
	if err != nil {
		return nil, nil
	}
	artifact := ChartDataArtifact{
		Type:  ArtifactTypeChartData,
		ID:    artifactID,
		Value: value,
	}
	s.storeChartCache(resolvedPath, artifact, hash)
	cloned := cloneChartDataArtifact(artifact)
	return &cloned, nil
}

func (s *Service) loadCachedJSON(rawPath string, artifactType ArtifactType) (*JSONArtifact, error) {
	artifactID, resolvedPath, err := s.resolveArtifactPath(rawPath)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, nil
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return nil, nil
	}
	hash := hashBytes(content)

	s.mu.RLock()
	if cached, ok := s.jsonArtifacts[resolvedPath]; ok && cached.Type == artifactType {
		if metadata := s.metadata[resolvedPath]; metadata.LastKnownHash == hash {
			cloned := cloneJSONArtifact(cached)
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	canonicalJSON, err := canonicalizeJSONObject(content)
	if err != nil {
		return nil, nil
	}
	artifact := JSONArtifact{
		Type:  artifactType,
		ID:    artifactID,
		Value: canonicalJSON,
	}
	s.storeJSONCache(resolvedPath, artifact, hash)
	cloned := cloneJSONArtifact(artifact)
	return &cloned, nil
}

func (s *Service) resolveWorkspaceFile(raw string) (string, error) {
	resolved, err := statefs.ResolveWithinRoot(s.workspaceRoot, raw, "File path")
	if err != nil {
		return "", &Error{
			Kind:    ErrorPathForbidden,
			Message: err.Error(),
		}
	}
	return resolved, nil
}

func (s *Service) resolveArtifactPath(raw string) (string, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Artifact id must be a non-empty string.",
		}
	}
	var resolved string
	var err error
	if filepath.IsAbs(trimmed) {
		resolved, err = statefs.NormalizePath(trimmed, "")
		if err != nil {
			return "", "", &Error{
				Kind:    ErrorInvalidRequest,
				Message: "Invalid artifact id.",
			}
		}
		if _, err := statefs.EnsureWithinRoot(s.artifactsRoot, resolved, "artifact path"); err != nil {
			return "", "", &Error{
				Kind:    ErrorPathForbidden,
				Message: err.Error(),
			}
		}
	} else {
		resolved, err = statefs.ResolveWithinRoot(s.settaFilesRoot, trimmed, "artifact path")
		if err != nil {
			return "", "", &Error{
				Kind:    ErrorPathForbidden,
				Message: err.Error(),
			}
		}
		if _, err := statefs.EnsureWithinRoot(s.artifactsRoot, resolved, "artifact path"); err != nil {
			return "", "", &Error{
				Kind:    ErrorPathForbidden,
				Message: err.Error(),
			}
		}
	}
	artifactID, err := s.normalizeResolvedArtifactID(resolved)
	if err != nil {
		return "", "", err
	}
	return artifactID, resolved, nil
}

func (s *Service) normalizeResolvedArtifactID(resolvedPath string) (string, error) {
	relative, err := filepath.Rel(s.settaFilesRoot, resolvedPath)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Invalid artifact path.",
		}
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", &Error{
			Kind:    ErrorPathForbidden,
			Message: fmt.Sprintf("artifact path must be within %s", s.settaFilesRoot),
		}
	}
	return filepath.ToSlash(relative), nil
}

func (s *Service) newArtifactTargetPath(extension string) (string, string, error) {
	trimmedExtension := strings.TrimSpace(extension)
	if trimmedExtension == "" {
		trimmedExtension = ".bin"
	}
	if !strings.HasPrefix(trimmedExtension, ".") {
		trimmedExtension = "." + trimmedExtension
	}
	for range 8 {
		id, err := newArtifactID(trimmedExtension)
		if err != nil {
			return "", "", err
		}
		targetPath, err := statefs.ResolveWithinRoot(s.settaFilesRoot, id, "artifact path")
		if err != nil {
			return "", "", err
		}
		if _, err := os.Stat(targetPath); errors.Is(err, os.ErrNotExist) {
			return id, targetPath, nil
		}
	}
	return "", "", fmt.Errorf("allocate artifact id: exhausted collision retries")
}

func (s *Service) createConflictBackup(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read conflict backup source: %w", err)
	}
	backupPath := conflictBackupPath(path, s.timeNow())
	if err := statefs.AtomicWriteFile(backupPath, content, defaultFileMode); err != nil {
		return "", fmt.Errorf("write conflict backup: %w", err)
	}
	return backupPath, nil
}

func (s *Service) storeImageCache(path string, artifact ImageArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.images[path]; ok && existing.Value.ContentID != artifact.Value.ContentID {
		_ = s.binaryStore.Delete(existing.Value.ContentID)
	}
	s.images[path] = artifact
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeChartCache(path string, artifact ChartDataArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.chartData[path] = cloneChartDataArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeJSONCache(path string, artifact JSONArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jsonArtifacts[path] = cloneJSONArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeFileCache(path string, artifact FileArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.files[path]; ok && existing.Value.ContentID != artifact.Value.ContentID {
		_ = s.binaryStore.Delete(existing.Value.ContentID)
	}
	s.files[path] = artifact
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func joinedExtensions(name string) string {
	base := filepath.Base(name)
	if base == "" {
		return ""
	}
	index := strings.Index(base, ".")
	if index <= 0 || index == len(base)-1 {
		return ""
	}
	return base[index:]
}

func newArtifactID(extension string) (string, error) {
	buffer := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, buffer); err != nil {
		return "", fmt.Errorf("create artifact id: %w", err)
	}
	return filepath.ToSlash(filepath.Join("artifacts", hex.EncodeToString(buffer)+extension)), nil
}

func guessMimeType(path string, fallback string) string {
	trimmedFallback := strings.TrimSpace(fallback)
	if guessed := strings.TrimSpace(mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))); guessed != "" {
		return guessed
	}
	if trimmedFallback != "" {
		return trimmedFallback
	}
	return "application/octet-stream"
}

func canonicalizeJSONObject(raw []byte) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if _, ok := value.(map[string]any); !ok {
		return nil, fmt.Errorf("expected object")
	}
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func parseChartCSV(content []byte) (map[string][]any, error) {
	reader := csv.NewReader(strings.NewReader(string(content)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return map[string][]any{}, nil
	}
	headers := records[0]
	result := make(map[string][]any, len(headers))
	for _, header := range headers {
		result[header] = []any{}
	}
	for _, row := range records[1:] {
		for columnIndex, header := range headers {
			if columnIndex >= len(row) {
				result[header] = append(result[header], "")
				continue
			}
			value := strings.TrimSpace(row[columnIndex])
			if value == "" {
				result[header] = append(result[header], "")
				continue
			}
			if numberValue, err := strconv.ParseFloat(value, 64); err == nil {
				result[header] = append(result[header], numberValue)
				continue
			}
			result[header] = append(result[header], value)
		}
	}
	return result, nil
}

func conflictBackupPath(path string, now time.Time) string {
	suffix := filepath.Ext(path)
	base := strings.TrimSuffix(path, suffix)
	return fmt.Sprintf("%s.conflict_backup_%s%s", base, now.Format("20060102_150405"), suffix)
}

func fileHash(path string) (string, bool, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("read artifact for hashing: %w", err)
	}
	return hashBytes(content), true, nil
}

func hashBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func cloneRawJSON(value json.RawMessage) json.RawMessage {
	if value == nil {
		return nil
	}
	return append(json.RawMessage(nil), value...)
}

func cloneJSONArtifact(artifact JSONArtifact) JSONArtifact {
	return JSONArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: cloneRawJSON(artifact.Value),
	}
}

func cloneChartDataArtifact(artifact ChartDataArtifact) ChartDataArtifact {
	clonedValues := make(map[string][]any, len(artifact.Value))
	for key, values := range artifact.Value {
		clonedValues[key] = append([]any(nil), values...)
	}
	return ChartDataArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: clonedValues,
	}
}
