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
	"sort"
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

func (s *Service) buildUpdateAction(artifact RawArtifact, scope UploadScope) (updateAction, error) {
	artifactID, targetPath, err := s.resolveArtifactPath(artifact.ID)
	if err != nil {
		return updateAction{}, err
	}
	builder, ok := updateActionBuilders[artifact.Type]
	if !ok {
		return updateAction{}, unsupportedArtifactTypeError(artifact.Type)
	}
	return builder(s, artifactUpdateInput{
		artifact:   artifact,
		artifactID: artifactID,
		targetPath: targetPath,
		scope:      scope,
	})
}

func (s *Service) parseBinaryRef(artifactID string, artifact RawArtifact, payloadLabel string) (binarypayload.ContentRef, error) {
	if artifact.Value == nil {
		return binarypayload.ContentRef{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
		}
	}
	var ref binarypayload.ContentRef
	if err := json.Unmarshal(*artifact.Value, &ref); err != nil {
		return binarypayload.ContentRef{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Artifact %s has an invalid %s payload.", artifactID, payloadLabel),
		}
	}
	return ref, nil
}

func (s *Service) readBinaryContent(ref binarypayload.ContentRef) ([]byte, error) {
	content, err := s.binaryStore.ReadBytes(ref.ContentID)
	if err != nil {
		switch {
		case errors.Is(err, binarypayload.ErrInvalidContentID), errors.Is(err, binarypayload.ErrContentIDRequired):
			return nil, &Error{
				Kind:    ErrorBinaryPayloadInvalid,
				Message: "Invalid binary content id.",
			}
		case errors.Is(err, binarypayload.ErrPayloadNotFound):
			return nil, &Error{
				Kind:    ErrorBinaryPayloadNotFound,
				Message: "Binary payload not found.",
			}
		default:
			return nil, err
		}
	}
	return content, nil
}

func (s *Service) applyUpdateAction(action updateAction, strategy SaveConflictStrategy) (ArtifactSaveResult, error) {
	lastKnownHash := s.lastKnownHash(action.targetPath)
	if lastKnownHash != "" && lastKnownHash == action.payloadHash {
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

	resolution, err := s.resolveUpdateConflict(action.targetPath, lastKnownHash, currentHash, exists, strategy)
	if err != nil {
		return ArtifactSaveResult{}, err
	}
	if resolution.skipWrite {
		return buildArtifactSaveResult(action, resolution), nil
	}

	if err := statefs.AtomicWriteFile(action.targetPath, action.payload, defaultFileMode); err != nil {
		return ArtifactSaveResult{}, fmt.Errorf("write artifact: %w", err)
	}
	if err := s.cacheUpdatedArtifact(action); err != nil {
		return ArtifactSaveResult{}, err
	}

	return buildArtifactSaveResult(action, resolution), nil
}

func (s *Service) prepareImport(rawPath string, scope UploadScope) (preparedImport, error) {
	resolvedPath, err := s.resolveWorkspaceFile(rawPath)
	if err != nil {
		return preparedImport{}, err
	}
	content, err := readImportContent(rawPath, resolvedPath)
	if err != nil {
		return preparedImport{}, err
	}
	name := filepath.Base(resolvedPath)
	mimeType := guessMimeType(resolvedPath, "")
	if err := EnforceUploadPolicy(s.uploadPolicies, scope, name, mimeType, len(content)); err != nil {
		return preparedImport{}, err
	}
	artifactID, targetPath, err := s.newArtifactTargetPath(joinedExtensions(name))
	if err != nil {
		return preparedImport{}, err
	}
	return preparedImport{
		action: importAction{
			artifactID: artifactID,
			targetPath: targetPath,
			name:       name,
			mimeType:   mimeType,
			content:    content,
		},
		result: ImportFilesResponseItem{
			Kind:     "file",
			ID:       artifactID,
			Name:     name,
			MimeType: mimeType,
			Size:     len(content),
		},
	}, nil
}

func readImportContent(rawPath string, resolvedPath string) ([]byte, error) {
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
	return content, nil
}

func (s *Service) persistImport(action importAction) error {
	if err := statefs.AtomicWriteFile(action.targetPath, action.content, defaultFileMode); err != nil {
		return fmt.Errorf("write imported artifact: %w", err)
	}
	ref, err := s.binaryStore.StoreBytes(action.content, action.mimeType, true)
	if err != nil {
		return err
	}
	s.storeFileCache(action.targetPath, FileArtifact{
		Type:  ArtifactTypeFile,
		ID:    action.artifactID,
		Value: ref,
	}, hashBytes(action.content))
	return nil
}

func buildFileUpdateAction(s *Service, input artifactUpdateInput) (updateAction, error) {
	return s.buildBinaryUpdateAction(input, "file", true)
}

func buildImageUpdateAction(s *Service, input artifactUpdateInput) (updateAction, error) {
	return s.buildBinaryUpdateAction(input, "binary", false)
}

func (s *Service) buildBinaryUpdateAction(input artifactUpdateInput, payloadLabel string, enforcePolicy bool) (updateAction, error) {
	ref, content, err := s.readUpdateBinaryContent(input.artifactID, input.artifact, payloadLabel)
	if err != nil {
		return updateAction{}, err
	}
	mimeType := guessMimeType(input.targetPath, ref.MimeType)
	if enforcePolicy {
		if err := EnforceUploadPolicy(s.uploadPolicies, input.scope, input.artifactID, mimeType, len(content)); err != nil {
			return updateAction{}, err
		}
	}
	return updateAction{
		artifactType: input.artifact.Type,
		artifactID:   input.artifactID,
		targetPath:   input.targetPath,
		mimeType:     mimeType,
		payload:      content,
		payloadHash:  hashBytes(content),
		binaryRef:    &ref,
	}, nil
}

func (s *Service) readUpdateBinaryContent(artifactID string, artifact RawArtifact, payloadLabel string) (binarypayload.ContentRef, []byte, error) {
	ref, err := s.parseBinaryRef(artifactID, artifact, payloadLabel)
	if err != nil {
		return binarypayload.ContentRef{}, nil, err
	}
	content, err := s.readBinaryContent(ref)
	if err != nil {
		return binarypayload.ContentRef{}, nil, err
	}
	return ref, content, nil
}

func buildChartUpdateAction(_ *Service, input artifactUpdateInput) (updateAction, error) {
	value, err := parseChartArtifactValue(input.artifactID, input.artifact.Value)
	if err != nil {
		return updateAction{}, err
	}
	csvContent, err := chartDataToCSV(value)
	if err != nil {
		return updateAction{}, invalidArtifactRequestf(input.artifactID, "has an invalid chart data payload.")
	}
	return updateAction{
		artifactType: input.artifact.Type,
		artifactID:   input.artifactID,
		targetPath:   input.targetPath,
		payload:      csvContent,
		payloadHash:  hashBytes(csvContent),
		chartValue:   cloneChartDataValues(value),
	}, nil
}

func parseChartArtifactValue(artifactID string, rawValue *json.RawMessage) (ChartDataValue, error) {
	if rawValue == nil {
		return nil, missingArtifactValueError(artifactID)
	}
	var value ChartDataValue
	if err := json.Unmarshal(*rawValue, &value); err != nil {
		return nil, invalidArtifactRequestf(artifactID, "has an invalid chart data payload.")
	}
	return value, nil
}

func buildJSONUpdateAction(_ *Service, input artifactUpdateInput) (updateAction, error) {
	canonicalJSON, err := parseJSONObjectValue(input.artifact.Type, input.artifactID, input.artifact.Value)
	if err != nil {
		return updateAction{}, err
	}
	return updateAction{
		artifactType: input.artifact.Type,
		artifactID:   input.artifactID,
		targetPath:   input.targetPath,
		payload:      canonicalJSON,
		payloadHash:  hashBytes(canonicalJSON),
		jsonValue:    canonicalJSON,
	}, nil
}

func parseJSONObjectValue(artifactType ArtifactType, artifactID string, rawValue *json.RawMessage) (json.RawMessage, error) {
	if rawValue == nil {
		return nil, missingArtifactValueError(artifactID)
	}
	canonicalJSON, err := canonicalizeArtifactJSONObject(artifactType, *rawValue)
	if err != nil {
		return nil, invalidArtifactRequestf(artifactID, "has an invalid JSON value.")
	}
	return canonicalJSON, nil
}

func (s *Service) lastKnownHash(targetPath string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.metadata[targetPath].LastKnownHash
}

func (s *Service) resolveUpdateConflict(targetPath string, lastKnownHash string, currentHash string, exists bool, strategy SaveConflictStrategy) (updateConflictResolution, error) {
	resolution := updateConflictResolution{status: SaveStatusSaved}
	if lastKnownHash == "" || currentHash == lastKnownHash {
		return resolution, nil
	}
	switch strategy {
	case SaveConflictStrategySkip:
		return updateConflictResolution{
			status:    SaveStatusSkipped,
			message:   stringPtr("Skipped save due to detected external changes."),
			skipWrite: true,
		}, nil
	case SaveConflictStrategyBackup:
		backupPath, err := s.createResolvedConflictBackup(targetPath, exists)
		if err != nil {
			return updateConflictResolution{}, err
		}
		return updateConflictResolution{
			status:     SaveStatusConflict,
			backupPath: backupPath,
			message:    conflictBackupMessage(backupPath),
		}, nil
	case SaveConflictStrategyOverwrite:
		return updateConflictResolution{
			status:  SaveStatusConflict,
			message: stringPtr("External changes detected. Overwriting per requested strategy."),
		}, nil
	default:
		return updateConflictResolution{}, invalidConflictStrategyError(strategy)
	}
}

func (s *Service) createResolvedConflictBackup(targetPath string, exists bool) (*string, error) {
	if !exists {
		return nil, nil
	}
	createdBackup, err := s.createConflictBackup(targetPath)
	if err != nil {
		return nil, err
	}
	normalizedBackup, err := s.normalizeResolvedArtifactID(createdBackup)
	if err != nil {
		return nil, nil
	}
	return &normalizedBackup, nil
}

func conflictBackupMessage(backupPath *string) *string {
	if backupPath == nil {
		return stringPtr("External changes detected.")
	}
	return stringPtr(fmt.Sprintf("External changes detected. Previous contents copied to %s.", *backupPath))
}

func buildArtifactSaveResult(action updateAction, resolution updateConflictResolution) ArtifactSaveResult {
	return ArtifactSaveResult{
		ID:         action.artifactID,
		Type:       action.artifactType,
		Status:     resolution.status,
		BackupPath: resolution.backupPath,
		Message:    resolution.message,
	}
}

func (s *Service) cacheUpdatedArtifact(action updateAction) error {
	switch action.artifactType {
	case ArtifactTypeFile:
		ref, err := requireBinaryUpdateRef(action)
		if err != nil {
			return err
		}
		s.storeFileCache(action.targetPath, FileArtifact{
			Type:  ArtifactTypeFile,
			ID:    action.artifactID,
			Value: ref,
		}, action.payloadHash)
	case ArtifactTypeImage:
		ref, err := requireBinaryUpdateRef(action)
		if err != nil {
			return err
		}
		s.storeImageCache(action.targetPath, ImageArtifact{
			Type:  ArtifactTypeImage,
			ID:    action.artifactID,
			Value: ref,
		}, action.payloadHash)
	case ArtifactTypeChartData:
		s.storeChartCache(action.targetPath, ChartDataArtifact{
			Type:  ArtifactTypeChartData,
			ID:    action.artifactID,
			Value: cloneChartDataValues(action.chartValue),
		}, action.payloadHash)
	case ArtifactTypeBrushStroke, ArtifactTypeDrawAreaLayerItemTransform:
		s.storeJSONCache(action.targetPath, JSONArtifact{
			Type:  action.artifactType,
			ID:    action.artifactID,
			Value: cloneRawJSON(action.jsonValue),
		}, action.payloadHash)
	default:
		return unsupportedArtifactTypeError(action.artifactType)
	}
	return nil
}

func requireBinaryUpdateRef(action updateAction) (binarypayload.ContentRef, error) {
	if action.binaryRef == nil {
		return binarypayload.ContentRef{}, missingArtifactBinaryPayloadError(action.artifactID)
	}
	return *action.binaryRef, nil
}

func missingArtifactValueError(artifactID string) error {
	return invalidArtifactRequestf(artifactID, "is missing a value.")
}

func missingArtifactBinaryPayloadError(artifactID string) error {
	return invalidArtifactRequestf(artifactID, "is missing a binary payload.")
}

func unsupportedArtifactTypeError(artifactType ArtifactType) error {
	return &Error{
		Kind:    ErrorArtifactTypeUnsupported,
		Message: fmt.Sprintf("Artifact type %s is not supported.", artifactType),
	}
}

func invalidConflictStrategyError(strategy SaveConflictStrategy) error {
	return &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Invalid conflict strategy: %q", strategy),
	}
}

func invalidArtifactRequestf(artifactID string, format string, args ...any) error {
	return &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Artifact %s "+format, append([]any{artifactID}, args...)...),
	}
}

func stringPtr(value string) *string {
	return &value
}

func (s *Service) loadCachedImage(rawPath string) (*ImageArtifact, error) {
	artifactID, resolvedPath, err := s.resolveCachedPath(rawPath)
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
	cached := s.commitImageCache(resolvedPath, artifact, hash)
	cloned := cached
	return &cloned, nil
}

func (s *Service) loadCachedChart(rawPath string) (*ChartDataArtifact, error) {
	artifactID, resolvedPath, err := s.resolveCachedPath(rawPath)
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
	artifactID, resolvedPath, err := s.resolveCachedPath(rawPath)
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

	canonicalJSON, err := canonicalizeArtifactJSONObject(artifactType, content)
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

func (s *Service) resolveCachedPath(raw string) (string, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "artifact path must be a non-empty string",
		}
	}

	if artifactID, resolvedPath, err := s.resolveArtifactPath(trimmed); err == nil {
		return artifactID, resolvedPath, nil
	} else {
		var artifactErr *Error
		if !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorPathForbidden {
			return "", "", err
		}
	}

	resolvedPath, err := s.resolveWorkspaceFile(trimmed)
	if err != nil {
		return "", "", err
	}
	return trimmed, resolvedPath, nil
}

func (s *Service) resolveArtifactPath(raw string) (string, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "artifact path must be a non-empty string",
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

func (s *Service) commitImageCache(path string, artifact ImageArtifact, hash string) ImageArtifact {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.images[path]; ok {
		metadata, hasMetadata := s.metadata[path]
		if hasMetadata && metadata.LastKnownHash == hash {
			if existing.Value.ContentID != artifact.Value.ContentID {
				if _, err := s.binaryStore.ResolvePath(existing.Value.ContentID); err == nil {
					_ = s.binaryStore.Delete(artifact.Value.ContentID)
					return existing
				}
				_ = s.binaryStore.Delete(existing.Value.ContentID)
			}
			s.images[path] = artifact
			s.metadata[path] = artifactMetadata{LastKnownHash: hash}
			return artifact
		}
		if existing.Value.ContentID != artifact.Value.ContentID {
			_ = s.binaryStore.Delete(existing.Value.ContentID)
		}
	}
	s.images[path] = artifact
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
	return artifact
}

func (s *Service) storeImageCache(path string, artifact ImageArtifact, hash string) {
	_ = s.commitImageCache(path, artifact, hash)
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

func canonicalizeArtifactJSONObject(artifactType ArtifactType, raw []byte) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("expected object")
	}
	normalizeArtifactJSONObject(artifactType, object)
	return canonicalizeJSONObjectValue(object)
}

func canonicalizeJSONObjectValue(value any) (json.RawMessage, error) {
	if _, ok := value.(map[string]any); !ok {
		return nil, fmt.Errorf("expected object")
	}
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func normalizeArtifactJSONObject(artifactType ArtifactType, object map[string]any) {
	switch artifactType {
	case ArtifactTypeBrushStroke:
		normalizeArtifactJSONArrayField(object, "points")
	case ArtifactTypeDrawAreaLayerItemTransform:
		normalizeArtifactJSONArrayField(object, "eraserStrokes")
		strokes, ok := object["eraserStrokes"].([]any)
		if !ok {
			return
		}
		for _, rawStroke := range strokes {
			stroke, ok := rawStroke.(map[string]any)
			if !ok {
				continue
			}
			normalizeArtifactJSONArrayField(stroke, "points")
		}
	}
}

func normalizeArtifactJSONArrayField(object map[string]any, field string) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		object[field] = []any{}
		return
	}
	if values, ok := rawValue.([]any); ok && values == nil {
		object[field] = []any{}
	}
}

func chartDataToCSV(data ChartDataValue) ([]byte, error) {
	if len(data) == 0 {
		return []byte{}, nil
	}
	headers := make([]string, 0, len(data))
	maxRows := 0
	for header, values := range data {
		headers = append(headers, header)
		if len(values) > maxRows {
			maxRows = len(values)
		}
	}
	sort.Strings(headers)

	var builder strings.Builder
	writer := csv.NewWriter(&builder)
	if err := writer.Write(headers); err != nil {
		return nil, err
	}
	for rowIndex := 0; rowIndex < maxRows; rowIndex++ {
		row := make([]string, 0, len(headers))
		for _, header := range headers {
			values := data[header]
			if rowIndex >= len(values) || values[rowIndex] == nil {
				row = append(row, "")
				continue
			}
			row = append(row, fmt.Sprint(values[rowIndex]))
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return []byte(builder.String()), nil
}

func parseChartCSV(content []byte) (ChartDataValue, error) {
	reader := csv.NewReader(strings.NewReader(string(content)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return ChartDataValue{}, nil
	}
	headers := records[0]
	result := make(ChartDataValue, len(headers))
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

func cloneChartDataValues(values ChartDataValue) ChartDataValue {
	clonedValues := make(ChartDataValue, len(values))
	for key, items := range values {
		clonedValues[key] = append([]any(nil), items...)
	}
	return clonedValues
}

func cloneChartDataArtifact(artifact ChartDataArtifact) ChartDataArtifact {
	return ChartDataArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: cloneChartDataValues(artifact.Value),
	}
}
