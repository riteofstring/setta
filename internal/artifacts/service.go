package artifacts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
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
	UploadPolicies *UploadPolicies
	TimeNow        func() time.Time
}

type Service struct {
	workspaceRoot  string
	settaFilesRoot string
	artifactsRoot  string
	binaryStore    *binarypayload.Store
	uploadPolicies UploadPolicies
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

type preparedImport struct {
	action importAction
	result ImportFilesResponseItem
}

type updateAction struct {
	artifactType ArtifactType
	artifactID   string
	targetPath   string
	mimeType     string
	payload      []byte
	payloadHash  string
	jsonValue    json.RawMessage
	binaryRef    *binarypayload.ContentRef
	chartValue   ChartDataValue
}

type artifactUpdateInput struct {
	artifact   RawArtifact
	artifactID string
	targetPath string
	scope      UploadScope
}

type updateActionBuilder func(*Service, artifactUpdateInput) (updateAction, error)

type updateConflictResolution struct {
	status     SaveStatus
	backupPath *string
	message    *string
	skipWrite  bool
}

var updateActionBuilders = map[ArtifactType]updateActionBuilder{
	ArtifactTypeFile:                       buildFileUpdateAction,
	ArtifactTypeImage:                      buildImageUpdateAction,
	ArtifactTypeChartData:                  buildChartUpdateAction,
	ArtifactTypeBrushStroke:                buildJSONUpdateAction,
	ArtifactTypeDrawAreaLayerItemTransform: buildJSONUpdateAction,
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
		uploadPolicies: cloneUploadPolicies(options.UploadPolicies),
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
	prepared := make([]preparedImport, 0, len(request.Paths))
	results := make([]ImportFilesResponseItem, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		imported, err := s.prepareImport(rawPath, request.UploadScope)
		if err != nil {
			return nil, err
		}
		prepared = append(prepared, imported)
		results = append(results, imported.result)
	}
	for _, imported := range prepared {
		if err := s.persistImport(imported.action); err != nil {
			return nil, err
		}
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

func (s *Service) ReadBinaryContent(contentID string) ([]byte, error) {
	return s.binaryStore.ReadBytes(contentID)
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

func (s *Service) ValidateListenerUpdate(artifact RawArtifact, scope UploadScope) (string, error) {
	action, err := s.buildUpdateAction(artifact, scope)
	if err != nil {
		return "", err
	}
	return action.artifactID, nil
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
