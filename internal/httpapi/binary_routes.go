package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	binarypayload "setta/internal/binary"
	"setta/internal/deployments"
	"setta/internal/modes"
)

const (
	RouteBinaryUpload   = "/binary/upload"
	RouteBinaryDownload = "/binary/{contentId}"
)

type BinaryRouteDependencies struct {
	ModePolicy    modes.Policy
	ShareSessions modes.ShareSessionStore
	Deployment    *deployments.Runtime
	Store         *binarypayload.Store
}

type BinaryUploadFormRequest struct {
	Durable *bool             `json:"durable,omitempty"`
	File    openAPIBinaryFile `json:"file"`
}

type BinaryDownloadRequest struct {
	ContentID string `json:"contentId"`
}

type openAPIBinaryFile struct{}

func (openAPIBinaryFile) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Type:   huma.TypeString,
		Format: "binary",
	}
}

type openAPIBinaryPayload struct{}

func (openAPIBinaryPayload) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Type:   huma.TypeString,
		Format: "binary",
	}
}

func RegisterBinaryRoutes(router chi.Router, deps BinaryRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.Store == nil && !documentOnly {
		return fmt.Errorf("binary store is required")
	}

	registerOpenAPIPost[BinaryUploadFormRequest, binarypayload.ContentRef](
		router.With(RequireFullIDERuntime(deps.ModePolicy)),
		"uploadBinary",
		RouteBinaryUpload,
		binaryUploadHandler(deps.Store),
		withOpenAPITags("Binary"),
		withOpenAPISummary("Upload a binary payload to the runtime content store."),
		withOpenAPIModeRequirement("full-ide"),
		withOpenAPIRequestContentType("multipart/form-data"),
	)
	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil && !documentOnly {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		if deps.Deployment == nil && !documentOnly {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
		registerOpenAPIGet[openAPIBinaryPayload](
			router.With(RequireShareSession(modes.Resolver{
				Policy: deps.ModePolicy,
				Store:  deps.ShareSessions,
			})),
			"downloadBinary",
			RouteBinaryDownload,
			binaryDownloadHandler(deps.Store, deps.Deployment),
			withOpenAPITags("Binary"),
			withOpenAPISummary("Download a binary payload from the runtime content store."),
			withOpenAPIModeRequirement("not-launcher"),
			withOpenAPIPathParams[BinaryDownloadRequest](),
			withOpenAPIResponseContentType("application/octet-stream"),
		)
		return nil
	}
	registerOpenAPIGet[openAPIBinaryPayload](
		router.With(modeRequirementMiddleware(deps.ModePolicy, deps.ModePolicy.RequireNotLauncher)),
		"downloadBinary",
		RouteBinaryDownload,
		binaryDownloadHandler(deps.Store, nil),
		withOpenAPITags("Binary"),
		withOpenAPISummary("Download a binary payload from the runtime content store."),
		withOpenAPIModeRequirement("not-launcher"),
		withOpenAPIPathParams[BinaryDownloadRequest](),
		withOpenAPIResponseContentType("application/octet-stream"),
	)
	return nil
}

func binaryUploadHandler(store *binarypayload.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, binarypayload.DefaultMaxUploadBytes+1024)
		if err := r.ParseMultipartForm(binarypayload.DefaultMaxUploadBytes + 1024); err != nil {
			if strings.Contains(err.Error(), "request body too large") {
				writeError(w, r, http.StatusRequestEntityTooLarge, "binary_payload_too_large", payloadTooLargeMessage(binarypayload.DefaultMaxUploadBytes))
				return
			}
			writeError(w, r, http.StatusBadRequest, "invalid_multipart", "Invalid multipart form payload.")
			return
		}

		durable, err := parseFormBool(r.FormValue("durable"), true)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_form_value", err.Error())
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "missing_file", "Binary upload file is required.")
			return
		}
		defer file.Close()

		mimeType := header.Header.Get("Content-Type")
		ref, err := store.StoreStream(file, mimeType, durable, binarypayload.DefaultMaxUploadBytes)
		if err != nil {
			var tooLargeErr *binarypayload.PayloadTooLargeError
			if errors.As(err, &tooLargeErr) {
				writeError(w, r, http.StatusRequestEntityTooLarge, "binary_payload_too_large", payloadTooLargeMessage(tooLargeErr.MaxBytes))
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, ref)
	}
}

func binaryDownloadHandler(store *binarypayload.Store, deployment *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureBinaryDownloadsAllowed(w, r, deployment) {
			return
		}
		contentID := chi.URLParam(r, "contentId")
		path, err := store.ResolvePath(contentID)
		if err != nil {
			writeBinaryDownloadError(w, r, err)
			return
		}

		mediaType := "application/octet-stream"
		if ref, err := store.ResolveRef(contentID); err == nil && strings.TrimSpace(ref.MimeType) != "" {
			mediaType = ref.MimeType
		}
		w.Header().Set("Content-Type", mediaType)
		http.ServeFile(w, r, path)
	}
}

func ensureBinaryDownloadsAllowed(w http.ResponseWriter, r *http.Request, deployment *deployments.Runtime) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !deployment.Policy().AllowFileDownloads {
		writeError(w, r, http.StatusForbidden, "binary_download_forbidden", "Deployment policy disallows file downloads.")
		return false
	}
	return true
}

func writeBinaryDownloadError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, binarypayload.ErrContentIDRequired), errors.Is(err, binarypayload.ErrInvalidContentID):
		writeError(w, r, http.StatusBadRequest, "invalid_binary_content_id", "Invalid binary content id.")
	case errors.Is(err, binarypayload.ErrPayloadNotFound):
		writeError(w, r, http.StatusNotFound, "binary_payload_not_found", "Binary payload not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func parseFormBool(raw string, defaultValue bool) (bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultValue, nil
	}
	switch strings.ToLower(trimmed) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	default:
		return false, fmt.Errorf("Invalid boolean value: %q", raw)
	}
}

func payloadTooLargeMessage(maxBytes int64) string {
	return fmt.Sprintf("Binary payload is too large. Maximum size is %d bytes.", maxBytes)
}
