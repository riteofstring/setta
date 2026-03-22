package shareartifacts

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"setta/internal/artifacts"
	binarypayload "setta/internal/binary"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/statefs"
)

type ServiceOptions struct {
	Deployment     *deployments.Runtime
	BinaryStore    *binarypayload.Store
	UploadPolicies *artifacts.UploadPolicies
	WebsocketHub   *realtime.WebsocketHub
}

type Service struct {
	paths          projectstate.DeploymentPathPolicy
	policy         deployments.Policy
	binaryStore    *binarypayload.Store
	uploadPolicies artifacts.UploadPolicies
	websocketHub   *realtime.WebsocketHub

	mu            sync.RWMutex
	metadata      map[string]artifactMetadata
	images        map[string]artifacts.ImageArtifact
	chartData     map[string]artifacts.ChartDataArtifact
	jsonArtifacts map[string]artifacts.JSONArtifact
	sessions      map[string]*sessionOverlay
}

type artifactMetadata struct {
	LastKnownHash string
}

type sessionOverlay struct {
	entries map[string]overlayEntry
}

type overlayEntry struct {
	artifactType artifacts.ArtifactType
	deleted      bool
	image        *artifacts.ImageArtifact
	chart        *artifacts.ChartDataArtifact
	json         *artifacts.JSONArtifact
	file         *artifacts.FileArtifact
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Deployment == nil {
		return nil, fmt.Errorf("deployment runtime is required")
	}
	if options.BinaryStore == nil {
		return nil, fmt.Errorf("binary store is required")
	}
	uploadPolicies := artifacts.DefaultUploadPolicies()
	if options.UploadPolicies != nil {
		uploadPolicies = artifacts.UploadPolicies{
			Chat: artifacts.ScopeUploadPolicy{
				MaxFileBytes:        options.UploadPolicies.Chat.MaxFileBytes,
				MaxFileLabel:        options.UploadPolicies.Chat.MaxFileLabel,
				AllowedMimePrefixes: append([]string(nil), options.UploadPolicies.Chat.AllowedMimePrefixes...),
			},
			Generic: artifacts.ScopeUploadPolicy{
				MaxFileBytes:        options.UploadPolicies.Generic.MaxFileBytes,
				MaxFileLabel:        options.UploadPolicies.Generic.MaxFileLabel,
				AllowedMimePrefixes: append([]string(nil), options.UploadPolicies.Generic.AllowedMimePrefixes...),
			},
		}
	}
	return &Service{
		paths:          options.Deployment.Paths(),
		policy:         options.Deployment.Policy(),
		binaryStore:    options.BinaryStore,
		uploadPolicies: uploadPolicies,
		websocketHub:   options.WebsocketHub,
		metadata:       map[string]artifactMetadata{},
		images:         map[string]artifacts.ImageArtifact{},
		chartData:      map[string]artifacts.ChartDataArtifact{},
		jsonArtifacts:  map[string]artifacts.JSONArtifact{},
		sessions:       map[string]*sessionOverlay{},
	}, nil
}

func (s *Service) LoadCachedImages(_ context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ImageArtifact, error) {
	results := make([]*artifacts.ImageArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedImage(sessionID, rawPath)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) LoadCachedChartData(_ context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ChartDataArtifact, error) {
	results := make([]*artifacts.ChartDataArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedChart(sessionID, rawPath)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) LoadCachedBrushStrokes(_ context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error) {
	results := make([]*artifacts.JSONArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedJSON(sessionID, rawPath, artifacts.ArtifactTypeBrushStroke)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) LoadCachedDrawAreaLayerItemTransforms(_ context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error) {
	results := make([]*artifacts.JSONArtifact, 0, len(request.Paths))
	for _, rawPath := range request.Paths {
		artifact, err := s.loadCachedJSON(sessionID, rawPath, artifacts.ArtifactTypeDrawAreaLayerItemTransform)
		if err != nil {
			return nil, err
		}
		results = append(results, artifact)
	}
	return results, nil
}

func (s *Service) Update(ctx context.Context, sessionID string, request artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error) {
	if len(request.Artifacts) == 0 {
		return []artifacts.ArtifactSaveResult{}, nil
	}
	if err := s.requireMutablePolicy(); err != nil {
		return nil, err
	}

	results := make([]artifacts.ArtifactSaveResult, 0, len(request.Artifacts))
	broadcastArtifacts := make([]any, 0, len(request.Artifacts))
	for _, artifact := range request.Artifacts {
		artifactID, resolvedPath, err := s.resolveOverlayPath(artifact.ID)
		if err != nil {
			return nil, err
		}
		entry, broadcastArtifact, err := s.buildOverlayEntry(artifactID, resolvedPath, artifact, request.UploadScope)
		if err != nil {
			return nil, err
		}
		s.storeOverlayEntry(sessionID, resolvedPath, entry)
		if broadcastArtifact != nil {
			broadcastArtifacts = append(broadcastArtifacts, broadcastArtifact)
		}
		results = append(results, artifacts.ArtifactSaveResult{
			ID:     artifactID,
			Type:   artifact.Type,
			Status: artifacts.SaveStatusSaved,
		})
	}

	if len(broadcastArtifacts) > 0 && s.websocketHub != nil {
		if _, err := s.websocketHub.BroadcastJSON(ctx, realtime.NewUpdateArtifactsMessage(realtime.UpdateArtifactsContent{
			Artifacts:  broadcastArtifacts,
			UpdateType: "update",
		}), realtime.Selection{
			Type:           realtime.ConnectionTypeFrontend,
			ShareSessionID: strings.TrimSpace(sessionID),
		}); err != nil {
			return nil, err
		}
	}
	return results, nil
}

func (s *Service) ValidateListenerUpdate(artifact artifacts.RawArtifact, scope artifacts.UploadScope) (string, error) {
	if err := s.requireMutablePolicy(); err != nil {
		return "", err
	}
	artifactID, resolvedPath, err := s.resolveOverlayPath(artifact.ID)
	if err != nil {
		return "", err
	}
	if _, _, err := s.buildOverlayEntry(artifactID, resolvedPath, artifact, scope); err != nil {
		return "", err
	}
	return artifactID, nil
}

func (s *Service) Delete(_ context.Context, sessionID string, request artifacts.DeleteRequest) ([]string, error) {
	if len(request.Artifacts) == 0 {
		return []string{}, nil
	}
	if err := s.requireMutablePolicy(); err != nil {
		return nil, err
	}

	deleted := make([]string, 0, len(request.Artifacts))
	for _, item := range request.Artifacts {
		if item.Type != artifacts.ArtifactTypeFile {
			return nil, &artifacts.Error{
				Kind:    artifacts.ErrorArtifactTypeUnsupported,
				Message: fmt.Sprintf("Delete artifacts only supports File artifacts. Got %s.", item.Type),
			}
		}
		artifactID, resolvedPath, err := s.resolveArtifactDeletePath(item.ID)
		if err != nil {
			return nil, err
		}
		s.storeOverlayEntry(sessionID, resolvedPath, overlayEntry{
			artifactType: artifacts.ArtifactTypeFile,
			deleted:      true,
		})
		deleted = append(deleted, artifactID)
	}
	return deleted, nil
}

func (s *Service) DeleteShareSession(sessionID string) {
	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, trimmedID)
}

func (s *Service) loadCachedImage(sessionID string, rawPath string) (*artifacts.ImageArtifact, error) {
	artifactID, resolvedPath, err := s.resolveOverlayPath(rawPath)
	if err != nil {
		return nil, err
	}
	if entry, ok := s.overlayEntry(sessionID, resolvedPath); ok {
		if entry.deleted {
			return nil, nil
		}
		if entry.image != nil {
			cloned := cloneImageArtifact(*entry.image)
			return &cloned, nil
		}
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
			cloned := cloneImageArtifact(cached)
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	ref, err := s.binaryStore.StoreBytes(content, guessMimeType(resolvedPath, ""), true)
	if err != nil {
		return nil, err
	}
	artifact := artifacts.ImageArtifact{
		Type:  artifacts.ArtifactTypeImage,
		ID:    artifactID,
		Value: ref,
	}
	s.storeImageCache(resolvedPath, artifact, hash)
	cloned := cloneImageArtifact(artifact)
	return &cloned, nil
}

func (s *Service) loadCachedChart(sessionID string, rawPath string) (*artifacts.ChartDataArtifact, error) {
	artifactID, resolvedPath, err := s.resolveOverlayPath(rawPath)
	if err != nil {
		return nil, err
	}
	if entry, ok := s.overlayEntry(sessionID, resolvedPath); ok {
		if entry.deleted {
			return nil, nil
		}
		if entry.chart != nil {
			cloned := cloneChartDataArtifact(*entry.chart)
			return &cloned, nil
		}
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
	artifact := artifacts.ChartDataArtifact{
		Type:  artifacts.ArtifactTypeChartData,
		ID:    artifactID,
		Value: value,
	}
	s.storeChartCache(resolvedPath, artifact, hash)
	cloned := cloneChartDataArtifact(artifact)
	return &cloned, nil
}

func (s *Service) loadCachedJSON(sessionID string, rawPath string, artifactType artifacts.ArtifactType) (*artifacts.JSONArtifact, error) {
	artifactID, resolvedPath, err := s.resolveOverlayPath(rawPath)
	if err != nil {
		return nil, err
	}
	if entry, ok := s.overlayEntry(sessionID, resolvedPath); ok {
		if entry.deleted {
			return nil, nil
		}
		if entry.json != nil && entry.artifactType == artifactType {
			cloned := cloneJSONArtifact(*entry.json)
			return &cloned, nil
		}
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
	artifact := artifacts.JSONArtifact{
		Type:  artifactType,
		ID:    artifactID,
		Value: canonicalJSON,
	}
	s.storeJSONCache(resolvedPath, artifact, hash)
	cloned := cloneJSONArtifact(artifact)
	return &cloned, nil
}

func (s *Service) buildOverlayEntry(artifactID string, resolvedPath string, artifact artifacts.RawArtifact, scope artifacts.UploadScope) (overlayEntry, any, error) {
	switch artifact.Type {
	case artifacts.ArtifactTypeFile:
		ref, err := s.parseBinaryRef(artifactID, artifact)
		if err != nil {
			return overlayEntry{}, nil, err
		}
		content, err := s.readBinaryContent(ref)
		if err != nil {
			return overlayEntry{}, nil, err
		}
		if err := artifacts.EnforceUploadPolicy(s.uploadPolicies, scope, artifactID, guessMimeType(resolvedPath, ref.MimeType), len(content)); err != nil {
			return overlayEntry{}, nil, err
		}
		fileArtifact := artifacts.FileArtifact{
			Type:  artifacts.ArtifactTypeFile,
			ID:    artifactID,
			Value: ref,
		}
		return overlayEntry{
			artifactType: artifacts.ArtifactTypeFile,
			file:         &fileArtifact,
		}, nil, nil
	case artifacts.ArtifactTypeImage:
		ref, err := s.parseBinaryRef(artifactID, artifact)
		if err != nil {
			return overlayEntry{}, nil, err
		}
		if _, err := s.readBinaryContent(ref); err != nil {
			return overlayEntry{}, nil, err
		}
		imageArtifact := artifacts.ImageArtifact{
			Type:  artifacts.ArtifactTypeImage,
			ID:    artifactID,
			Value: ref,
		}
		return overlayEntry{
			artifactType: artifacts.ArtifactTypeImage,
			image:        &imageArtifact,
		}, cloneImageArtifact(imageArtifact), nil
	case artifacts.ArtifactTypeChartData:
		if artifact.Value == nil {
			return overlayEntry{}, nil, &artifacts.Error{
				Kind:    artifacts.ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
			}
		}
		var value artifacts.ChartDataValue
		if err := json.Unmarshal(*artifact.Value, &value); err != nil {
			return overlayEntry{}, nil, &artifacts.Error{
				Kind:    artifacts.ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s has an invalid chart data payload.", artifactID),
			}
		}
		chartArtifact := artifacts.ChartDataArtifact{
			Type:  artifacts.ArtifactTypeChartData,
			ID:    artifactID,
			Value: value,
		}
		return overlayEntry{
			artifactType: artifacts.ArtifactTypeChartData,
			chart:        &chartArtifact,
		}, cloneChartDataArtifact(chartArtifact), nil
	case artifacts.ArtifactTypeBrushStroke, artifacts.ArtifactTypeDrawAreaLayerItemTransform:
		if artifact.Value == nil {
			return overlayEntry{}, nil, &artifacts.Error{
				Kind:    artifacts.ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
			}
		}
		canonicalJSON, err := canonicalizeJSONObject(*artifact.Value)
		if err != nil {
			return overlayEntry{}, nil, &artifacts.Error{
				Kind:    artifacts.ErrorInvalidRequest,
				Message: fmt.Sprintf("Artifact %s has an invalid JSON value.", artifactID),
			}
		}
		jsonArtifact := artifacts.JSONArtifact{
			Type:  artifact.Type,
			ID:    artifactID,
			Value: canonicalJSON,
		}
		return overlayEntry{
			artifactType: artifact.Type,
			json:         &jsonArtifact,
		}, cloneJSONArtifact(jsonArtifact), nil
	default:
		return overlayEntry{}, nil, &artifacts.Error{
			Kind:    artifacts.ErrorArtifactTypeUnsupported,
			Message: fmt.Sprintf("Artifact type %s is not supported.", artifact.Type),
		}
	}
}

func (s *Service) parseBinaryRef(artifactID string, artifact artifacts.RawArtifact) (binarypayload.ContentRef, error) {
	if artifact.Value == nil {
		return binarypayload.ContentRef{}, &artifacts.Error{
			Kind:    artifacts.ErrorInvalidRequest,
			Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
		}
	}
	var ref binarypayload.ContentRef
	if err := json.Unmarshal(*artifact.Value, &ref); err != nil {
		return binarypayload.ContentRef{}, &artifacts.Error{
			Kind:    artifacts.ErrorInvalidRequest,
			Message: fmt.Sprintf("Artifact %s has an invalid binary payload.", artifactID),
		}
	}
	return ref, nil
}

func (s *Service) readBinaryContent(ref binarypayload.ContentRef) ([]byte, error) {
	content, err := s.binaryStore.ReadBytes(ref.ContentID)
	if err != nil {
		switch {
		case errors.Is(err, binarypayload.ErrInvalidContentID), errors.Is(err, binarypayload.ErrContentIDRequired):
			return nil, &artifacts.Error{
				Kind:    artifacts.ErrorBinaryPayloadInvalid,
				Message: "Invalid binary content id.",
			}
		case errors.Is(err, binarypayload.ErrPayloadNotFound):
			return nil, &artifacts.Error{
				Kind:    artifacts.ErrorBinaryPayloadNotFound,
				Message: "Binary payload not found.",
			}
		default:
			return nil, err
		}
	}
	return content, nil
}

func (s *Service) overlayEntry(sessionID string, resolvedPath string) (overlayEntry, bool) {
	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return overlayEntry{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	session := s.sessions[trimmedID]
	if session == nil {
		return overlayEntry{}, false
	}
	entry, ok := session.entries[resolvedPath]
	if !ok {
		return overlayEntry{}, false
	}
	return cloneOverlayEntry(entry), true
}

func (s *Service) storeOverlayEntry(sessionID string, resolvedPath string, entry overlayEntry) {
	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[trimmedID]
	if session == nil {
		session = &sessionOverlay{entries: map[string]overlayEntry{}}
		s.sessions[trimmedID] = session
	}
	session.entries[resolvedPath] = cloneOverlayEntry(entry)
}

func (s *Service) requireMutablePolicy() error {
	if s.policy.AllowParamChanges {
		return nil
	}
	return &artifacts.Error{
		Kind:    artifacts.ErrorPolicyDenied,
		Message: "Share policy disallows parameter changes.",
	}
}

func (s *Service) resolveOverlayPath(raw string) (string, string, error) {
	resolvedPath, err := s.resolveDeploymentPath(raw)
	if err != nil {
		return "", "", err
	}
	if _, err := s.ensureAllowedRoot(resolvedPath); err != nil {
		return "", "", err
	}
	artifactID, err := s.normalizeResolvedArtifactID(resolvedPath)
	if err != nil {
		return "", "", err
	}
	return artifactID, resolvedPath, nil
}

func (s *Service) resolveArtifactDeletePath(raw string) (string, string, error) {
	resolvedPath, err := s.resolveDeploymentPath(raw)
	if err != nil {
		return "", "", err
	}
	if _, err := statefs.EnsureWithinRoot(s.paths.ArtifactsRoot, resolvedPath, "artifact path"); err != nil {
		return "", "", &artifacts.Error{
			Kind:    artifacts.ErrorPathForbidden,
			Message: err.Error(),
		}
	}
	artifactID, err := s.normalizeResolvedArtifactID(resolvedPath)
	if err != nil {
		return "", "", err
	}
	return artifactID, resolvedPath, nil
}

func (s *Service) resolveDeploymentPath(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", &artifacts.Error{
			Kind:    artifacts.ErrorInvalidRequest,
			Message: "artifact path must be a non-empty string",
		}
	}
	if filepath.IsAbs(trimmed) {
		resolved, err := statefs.NormalizePath(trimmed, "")
		if err != nil {
			return "", &artifacts.Error{
				Kind:    artifacts.ErrorInvalidRequest,
				Message: "Invalid artifact id.",
			}
		}
		return resolved, nil
	}
	resolved, err := statefs.ResolveWithinRoot(s.paths.DeploymentRoot, trimmed, "artifact path")
	if err != nil {
		return "", &artifacts.Error{
			Kind:    artifacts.ErrorPathForbidden,
			Message: err.Error(),
		}
	}
	return resolved, nil
}

func (s *Service) ensureAllowedRoot(resolvedPath string) (string, error) {
	for _, root := range []string{s.paths.ArtifactsRoot, s.paths.JSONSourcesRoot, s.paths.CodeRoot} {
		if normalized, err := statefs.EnsureWithinRoot(root, resolvedPath, "artifact path"); err == nil {
			return normalized, nil
		}
	}
	return "", &artifacts.Error{
		Kind:    artifacts.ErrorPathForbidden,
		Message: "artifact path must be within the deployment artifacts, json_sources, or code roots",
	}
}

func (s *Service) normalizeResolvedArtifactID(resolvedPath string) (string, error) {
	relative, err := filepath.Rel(s.paths.DeploymentRoot, resolvedPath)
	if err != nil {
		return "", &artifacts.Error{
			Kind:    artifacts.ErrorInvalidRequest,
			Message: "Invalid artifact path.",
		}
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", &artifacts.Error{
			Kind:    artifacts.ErrorPathForbidden,
			Message: fmt.Sprintf("artifact path must be within %s", s.paths.DeploymentRoot),
		}
	}
	return filepath.ToSlash(relative), nil
}

func (s *Service) storeImageCache(path string, artifact artifacts.ImageArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.images[path]; ok && existing.Value.ContentID != artifact.Value.ContentID {
		_ = s.binaryStore.Delete(existing.Value.ContentID)
	}
	s.images[path] = cloneImageArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeChartCache(path string, artifact artifacts.ChartDataArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.chartData[path] = cloneChartDataArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeJSONCache(path string, artifact artifacts.JSONArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jsonArtifacts[path] = cloneJSONArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
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

func parseChartCSV(content []byte) (artifacts.ChartDataValue, error) {
	reader := csv.NewReader(strings.NewReader(string(content)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return artifacts.ChartDataValue{}, nil
	}
	headers := records[0]
	result := make(artifacts.ChartDataValue, len(headers))
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

func cloneImageArtifact(artifact artifacts.ImageArtifact) artifacts.ImageArtifact {
	return artifacts.ImageArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: artifact.Value,
	}
}

func cloneJSONArtifact(artifact artifacts.JSONArtifact) artifacts.JSONArtifact {
	return artifacts.JSONArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: cloneRawJSON(artifact.Value),
	}
}

func cloneChartDataArtifact(artifact artifacts.ChartDataArtifact) artifacts.ChartDataArtifact {
	clonedValues := make(artifacts.ChartDataValue, len(artifact.Value))
	for key, values := range artifact.Value {
		clonedValues[key] = append([]any(nil), values...)
	}
	return artifacts.ChartDataArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: clonedValues,
	}
}

func cloneFileArtifact(artifact artifacts.FileArtifact) artifacts.FileArtifact {
	return artifacts.FileArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: artifact.Value,
	}
}

func cloneOverlayEntry(entry overlayEntry) overlayEntry {
	cloned := overlayEntry{
		artifactType: entry.artifactType,
		deleted:      entry.deleted,
	}
	if entry.image != nil {
		image := cloneImageArtifact(*entry.image)
		cloned.image = &image
	}
	if entry.chart != nil {
		chart := cloneChartDataArtifact(*entry.chart)
		cloned.chart = &chart
	}
	if entry.json != nil {
		jsonArtifact := cloneJSONArtifact(*entry.json)
		cloned.json = &jsonArtifact
	}
	if entry.file != nil {
		file := cloneFileArtifact(*entry.file)
		cloned.file = &file
	}
	return cloned
}
