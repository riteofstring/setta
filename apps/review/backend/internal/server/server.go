package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/setta/local-backend/localweb"
	"github.com/setta/review/backend/internal/contracts"
	"github.com/setta/review/backend/internal/coordinator"
)

const maximumJSONBytes = 4 << 20

type Service interface {
	Snapshot() (contracts.ReviewSnapshot, error)
	Apply(contracts.ReviewMutation) (contracts.MutationResult, error)
	Export(bool) (contracts.ExportResult, error)
	Subscribe(context.Context) (<-chan contracts.ReviewSnapshot, error)
	OpenArtifact(string, string) (*os.File, contracts.ArtifactEvidenceReference, error)
}

type Handler struct {
	service      Service
	projectRoot  string
	sessionNonce string
	serverURL    string
	mux          *http.ServeMux
}

func New(service Service, projectRoot string, sessionNonce string, serverURL string) (*Handler, error) {
	if service == nil || strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(sessionNonce) == "" || strings.TrimSpace(serverURL) == "" {
		return nil, errors.New("server: service and identity configuration are required")
	}
	canonical, err := filepath.Abs(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("server: resolve project root: %w", err)
	}
	handler := &Handler{service: service, projectRoot: canonical, sessionNonce: sessionNonce, serverURL: serverURL, mux: http.NewServeMux()}
	handler.mux.HandleFunc("/api/v1/review", handler.review)
	handler.mux.HandleFunc("/api/v1/review/apply", handler.apply)
	handler.mux.HandleFunc("/api/v1/review/events", handler.events)
	handler.mux.HandleFunc("/api/v1/review/export", handler.export)
	handler.mux.HandleFunc("/api/v1/evidence/", handler.artifact)
	handler.mux.HandleFunc("/api/v2/runtime/session", handler.identity)
	return handler, nil
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	handler.mux.ServeHTTP(response, request)
}

func (handler *Handler) review(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	snapshot, err := handler.service.Snapshot()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler *Handler) apply(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request) {
		return
	}
	var mutation contracts.ReviewMutation
	if err := decodeJSON(request, &mutation); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", err.Error(), nil, nil)
		return
	}
	if err := mutation.Validate(); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", err.Error(), nil, nil)
		return
	}
	result, err := handler.service.Apply(mutation)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) events(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "stream_unavailable", "Streaming is unavailable.", nil, nil)
		return
	}
	stream, err := handler.service.Subscribe(request.Context())
	if err != nil {
		writeFailure(response, err)
		return
	}
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Connection", "keep-alive")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()
	for {
		select {
		case <-request.Context().Done():
			return
		case snapshot, open := <-stream:
			if !open {
				return
			}
			encoded, err := json.Marshal(snapshot)
			if err != nil {
				return
			}
			if _, err := fmt.Fprintf(response, "event: snapshot\ndata: %s\n\n", encoded); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (handler *Handler) export(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request) {
		return
	}
	includeContinuations := false
	if raw := request.URL.Query().Get("continuations"); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil || len(request.URL.Query()) != 1 {
			writeError(response, http.StatusBadRequest, "invalid_request", "The continuations query value is invalid.", nil, nil)
			return
		}
		includeContinuations = parsed
	} else if len(request.URL.Query()) != 0 {
		writeError(response, http.StatusBadRequest, "invalid_request", "The export query is invalid.", nil, nil)
		return
	}
	result, err := handler.service.Export(includeContinuations)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) artifact(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		response.Header().Set("Allow", "GET, HEAD")
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.", nil, nil)
		return
	}
	download, validQuery := artifactDownload(request.URL.RawQuery)
	if !validQuery {
		writeError(response, http.StatusBadRequest, "invalid_request", "The artifact query is invalid.", nil, nil)
		return
	}
	requestID, evidenceID, ok := artifactIdentity(request.URL.Path)
	if !ok {
		http.NotFound(response, request)
		return
	}
	file, metadata, err := handler.service.OpenArtifact(requestID, evidenceID)
	if err != nil {
		writeFailure(response, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		writeFailure(response, err)
		return
	}
	if !download && !inlineArtifactMediaType(metadata.MediaType) {
		writeError(response, http.StatusUnsupportedMediaType, "unsupported_media_type", "The artifact media type is not available for inline preview.", nil, nil)
		return
	}
	disposition := "inline"
	if download {
		disposition = "attachment"
	} else {
		setArtifactPreviewHeaders(response.Header())
	}
	response.Header().Set("Content-Type", metadata.MediaType)
	response.Header().Set("Content-Length", strconv.FormatInt(metadata.ByteLength, 10))
	response.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": filepath.Base(metadata.Path)}))
	http.ServeContent(response, request, filepath.Base(metadata.Path), info.ModTime(), file)
}

func (handler *Handler) identity(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{
		"schemaVersion": "review-session/v1",
		"appId":         "review",
		"projectPath":   handler.projectRoot,
		"instanceNonce": handler.sessionNonce,
	})
}

func (handler *Handler) mutationRequest(response http.ResponseWriter, request *http.Request) bool {
	if !exactMethod(response, request, http.MethodPost) {
		return false
	}
	if !localweb.OriginAllowed(request, handler.serverURL) {
		writeError(response, http.StatusForbidden, "forbidden_origin", "The request origin is not allowed.", nil, nil)
		return false
	}
	if request.URL.Path == "/api/v1/review/apply" {
		mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeError(response, http.StatusUnsupportedMediaType, "unsupported_media_type", "The request must contain application/json.", nil, nil)
			return false
		}
	}
	return true
}

func exactMethod(response http.ResponseWriter, request *http.Request, method string) bool {
	if request.Method == method {
		return true
	}
	response.Header().Set("Allow", method)
	writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.", nil, nil)
	return false
}

func decodeJSON(request *http.Request, target any) error {
	defer request.Body.Close()
	data, err := io.ReadAll(io.LimitReader(request.Body, maximumJSONBytes+1))
	if err != nil {
		return fmt.Errorf("server: read request: %w", err)
	}
	if len(data) > maximumJSONBytes {
		return errors.New("server: request exceeds the size limit")
	}
	if len(data) == 0 {
		return errors.New("server: request body is empty")
	}
	return contracts.DecodeStrict(data, target)
}

func artifactIdentity(path string) (string, string, bool) {
	relative := strings.TrimPrefix(path, "/api/v1/evidence/")
	parts := strings.Split(relative, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func artifactDownload(rawQuery string) (bool, bool) {
	if rawQuery == "" {
		return false, true
	}
	query, err := url.ParseQuery(rawQuery)
	if err != nil || len(query) != 1 {
		return false, false
	}
	values, ok := query["download"]
	if !ok || len(values) != 1 || values[0] != "1" {
		return false, false
	}
	return true, true
}

func inlineArtifactMediaType(mediaType string) bool {
	switch mediaType {
	case "audio/aac", "audio/flac", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm",
		"image/avif", "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp",
		"video/mp4", "video/ogg", "video/webm":
		return true
	default:
		return false
	}
}

func setArtifactPreviewHeaders(header http.Header) {
	header.Set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox")
	header.Set("Cross-Origin-Opener-Policy", "same-origin")
	header.Set("Cross-Origin-Resource-Policy", "same-origin")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("X-Frame-Options", "SAMEORIGIN")
}

func writeFailure(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, coordinator.ErrRevisionConflict):
		writeError(response, http.StatusConflict, "revision_conflict", "The review changed; reload before applying this decision.", nil, nil)
	case errors.Is(err, coordinator.ErrProjectIdentity):
		writeError(response, http.StatusConflict, "identity_conflict", "The mutation targets another review project.", nil, nil)
	case errors.Is(err, coordinator.ErrRequestMissing):
		writeError(response, http.StatusNotFound, "request_missing", "The review request does not exist.", nil, nil)
	case errors.Is(err, coordinator.ErrEvidenceMissing):
		writeError(response, http.StatusNotFound, "evidence_missing", "The requested evidence does not exist.", nil, nil)
	default:
		writeError(response, http.StatusInternalServerError, "internal_error", "Review could not complete the request.", nil, nil)
	}
}

func writeError(response http.ResponseWriter, status int, code string, message string, requestID *string, evidenceID *string) {
	writeJSON(response, status, contracts.StructuredError{Code: code, Message: message, RequestID: requestID, EvidenceID: evidenceID})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
